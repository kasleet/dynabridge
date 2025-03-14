import { DynamoDBClient, ReturnValuesOnConditionCheckFailure } from '@aws-sdk/client-dynamodb';
import { NativeAttributeValue, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb/dist-types/DynamoDBClient';
import {
  deleteBatchItem,
  deleteItem,
  getBatchItem,
  getItem,
  putItem,
  scan,
  transactWrite,
  writeBatchItem,
  query,
  QueryInput
} from './dynamodb';

type SimpleID = string | number;

type ComplexID = (string | number)[];

type ID = SimpleID | ComplexID;

type Migrations<T> = [...((e: any) => any)[], (e: any) => T] | ((e: any) => T);

type IndexDefinition<T> = {
  indexName: string;
  hashKey: Extract<keyof T, string>;
  sortKey?: Extract<keyof T, string>;
};

type QueryOptions = {
  scanIndexForward?: boolean;
  filterExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, NativeAttributeValue>;
};

type SortKeyCondition = {
  condition: 'EQ' | 'LT' | 'LE' | 'GT' | 'GE' | 'BEGINS_WITH' | 'BETWEEN';
  value: SimpleID | [SimpleID, SimpleID];
};

type DynaBridgeEntity<T = any, I extends string = string> = {
  tableName: string;
  id: Extract<keyof T, string> | Extract<keyof T, string>[];
  migrations?: Migrations<T>;
  index?: Record<I, IndexDefinition<T>>;
};

// Modified EntityCommands interface with type-safe index parameter
type EntityCommands<T extends Record<string, DynaBridgeEntity<any, any>>> = {
  [K in keyof T]: T[K] & {
    findById: (id: ID) => Promise<T[K] extends DynaBridgeEntity<infer U, any> ? U | undefined : never>;
    findByIds: (ids: ID[]) => Promise<(T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]>;
    findAll: () => Promise<(T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]>;
    save: (entity: T[K] extends DynaBridgeEntity<infer U, any> ? U : never) => Promise<void>;
    saveBatch: (entity: (T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]) => Promise<void>;
    delete: (entity: T[K] extends DynaBridgeEntity<infer U, any> ? U : never) => Promise<void>;
    deleteBatch: (entity: (T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]) => Promise<void>;
    deleteById: (id: ID) => Promise<void>;
    deleteByIds: (ids: ID[]) => Promise<void>;
    queryIndex: <I extends string>(
      indexName: T[K] extends DynaBridgeEntity<any, infer IX> ? IX : never,
      hashKeyValue: SimpleID,
      sortKeyCondition?: SortKeyCondition,
      options?: QueryOptions
    ) => Promise<(T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]>;
    query: (
      hashKeyValue: SimpleID,
      sortKeyCondition?: SortKeyCondition,
      options?: QueryOptions
    ) => Promise<(T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]>;
  };
};

class DynaBridge<T extends Record<string, DynaBridgeEntity>> {
  public entities: EntityCommands<T>;

  private readonly _entityTypes: T;
  private readonly ddbClient: DynamoDBClient;

  constructor(entities: T, config?: DynamoDBClientConfig) {
    this._entityTypes = entities;
    this.ddbClient = new DynamoDBClient(config ?? {});

    this.entities = {} as EntityCommands<T>;

    Object.keys(entities).forEach((key) => {
      const entityKey = key as keyof T;

      (this.entities[entityKey] as any) = {
        ...entities[entityKey],
        findById: this._findById.bind(this, this.ddbClient, entityKey),
        findByIds: this._findByIds.bind(this, this.ddbClient, entityKey),
        findAll: this._findAll.bind(this, this.ddbClient, entityKey),
        save: this._save.bind(this, this.ddbClient, entityKey),
        saveBatch: this._saveBatch.bind(this, this.ddbClient, entityKey),
        delete: this._delete.bind(this, this.ddbClient, entityKey),
        deleteBatch: this._deleteBatch.bind(this, this.ddbClient, entityKey),
        deleteById: this._deleteById.bind(this, this.ddbClient, entityKey),
        deleteByIds: this._deleteByIds.bind(this, this.ddbClient, entityKey),
        queryIndex: this._queryIndex.bind(this, this.ddbClient, entityKey),
        query: this._queryTable.bind(this, this.ddbClient, entityKey)
      };
    });
  }

  public async transaction(
    operations: {
      [K in keyof T]:
        | { action: 'Put'; type: K; entity: T[K] extends DynaBridgeEntity<infer U> ? U : never }
        | {
            action: 'Update';
            type: K;
            entity: T[K] extends DynaBridgeEntity<infer U> ? U : never;
            updateExpression: string;
            conditionExpression?: string;
            expressionAttributeNames?: Record<string, string>;
            expressionAttributeValues?: Record<string, NativeAttributeValue>;
            returnValuesOnConditionCheckFailure?: ReturnValuesOnConditionCheckFailure;
          }
        | { action: 'Delete'; type: K; entity: T[K] extends DynaBridgeEntity<infer U> ? U : never };
    }[keyof T][]
  ): Promise<void> {
    const transactItems: TransactWriteCommandInput['TransactItems'] = operations.map((operation) => {
      const { action, type, entity } = operation;

      const entityConfig = this._entityTypes[type];
      if (!entityConfig) {
        throw new Error(`Entity configuration not found for type: ${String(type)}`);
      }

      const tableName = entityConfig.tableName;
      const migrations = entityConfig.migrations;
      const version = migrations ? migrations.length + 1 : 1;

      switch (action) {
        case 'Put':
          const item = {
            ...(entity as Record<string, any>),
            _version: version,
            _updated_at: new Date().toISOString()
          };
          return { Put: { TableName: tableName, Item: item } };
        case 'Update':
          return {
            Update: {
              TableName: tableName,
              Key: this._getKeyFromEntity(type, entity),
              UpdateExpression: operation.updateExpression,
              ConditionExpression: operation.conditionExpression,
              ExpressionAttributeNames: operation.expressionAttributeNames,
              ExpressionAttributeValues: operation.expressionAttributeValues,
              ReturnValuesOnConditionCheckFailure: operation.returnValuesOnConditionCheckFailure
            }
          };
        case 'Delete':
          return { Delete: { TableName: tableName, Key: this._getKeyFromEntity(type, entity) } };
        default:
          throw new Error(`Invalid action type: ${action}`);
      }
    });

    return transactWrite(this.ddbClient, transactItems);
  }

  private async _findById<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K,
    id: ID
  ): Promise<T[K] extends DynaBridgeEntity<infer U> ? U | undefined : never> {
    const getItemRes = await getItem(ddbClient, this._entityTypes[type].tableName, this._createKey(type, id));
    if (!getItemRes) {
      return undefined as never;
    }

    const migrations = this._entityTypes[type].migrations;
    return this._migrate(getItemRes.entity, getItemRes.version, migrations);
  }

  private async _findByIds<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K,
    ids: ID[]
  ): Promise<(T[K] extends DynaBridgeEntity<infer U> ? U : never)[]> {
    const getBatchResult = await getBatchItem(
      ddbClient,
      this._entityTypes[type].tableName,
      ids.map((id) => this._createKey(type, id))
    );
    const migrations = this._entityTypes[type].migrations;
    return getBatchResult.map(
      (res) => this._migrate(res.entity, res.version, migrations) as T[K] extends DynaBridgeEntity<infer U> ? U : never
    );
  }

  private async _findAll<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K
  ): Promise<(T[K] extends DynaBridgeEntity<infer U> ? U : never)[]> {
    const scanResult = await scan(ddbClient, this._entityTypes[type].tableName);
    const migrations = this._entityTypes[type].migrations;
    return scanResult.map(
      (res) => this._migrate(res.entity, res.version, migrations) as T[K] extends DynaBridgeEntity<infer U> ? U : never
    );
  }

  private async _queryIndex<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K,
    indexName: string,
    hashKeyValue: SimpleID,
    sortKeyCondition?: SortKeyCondition,
    options?: QueryOptions
  ): Promise<(T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]> {
    const entityConfig = this._entityTypes[type];

    if (!entityConfig.index || !entityConfig.index[indexName]) {
      throw new Error(`Index '${indexName}' not found for entity type '${String(type)}'`);
    }

    const indexConfig = entityConfig.index[indexName];
    const tableName = entityConfig.tableName;
    const migrations = entityConfig.migrations;

    const queryParams = this._buildQueryParams(
      tableName,
      indexConfig.indexName,
      indexConfig.hashKey,
      hashKeyValue,
      indexConfig.sortKey,
      sortKeyCondition,
      options
    );

    const queryResult = await query(ddbClient, queryParams);

    return queryResult.map(
      (res) =>
        this._migrate(res.entity, res.version, migrations) as T[K] extends DynaBridgeEntity<infer U, any> ? U : never
    );
  }

  private async _queryTable<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K,
    hashKeyValue: SimpleID,
    sortKeyCondition?: SortKeyCondition,
    options?: QueryOptions
  ): Promise<(T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]> {
    const entityConfig = this._entityTypes[type];
    const tableName = entityConfig.tableName;
    const migrations = entityConfig.migrations;

    // For table queries, we need to use the primary key attributes
    const idDef = entityConfig.id;
    let hashKey: string;
    let sortKey: string | undefined;

    if (Array.isArray(idDef)) {
      if (idDef.length < 1 || idDef.length > 2) {
        throw new Error(`Invalid primary key definition for entity type '${String(type)}'`);
      }
      hashKey = idDef[0];
      sortKey = idDef.length === 2 ? idDef[1] : undefined;
    } else {
      hashKey = idDef;
    }

    const queryParams = this._buildQueryParams(
      tableName,
      undefined, // No index name for table queries
      hashKey,
      hashKeyValue,
      sortKey,
      sortKeyCondition,
      options
    );

    const queryResult = await query(ddbClient, queryParams);

    return queryResult.map(
      (res) =>
        this._migrate(res.entity, res.version, migrations) as T[K] extends DynaBridgeEntity<infer U, any> ? U : never
    );
  }

  private _buildQueryParams(
    tableName: string,
    indexName: string | undefined,
    hashKey: string,
    hashKeyValue: SimpleID,
    sortKey?: string,
    sortKeyCondition?: SortKeyCondition,
    options?: QueryOptions
  ): QueryInput {
    const queryParams: QueryInput = {
      TableName: tableName,
      KeyConditionExpression: `#hk = :hkv`,
      ExpressionAttributeNames: {
        '#hk': hashKey
      },
      ExpressionAttributeValues: {
        ':hkv': hashKeyValue
      }
    };

    if (indexName) {
      queryParams.IndexName = indexName;
    }

    // Add sort key condition if provided
    if (sortKey && sortKeyCondition) {
      const { condition, value } = sortKeyCondition;

      switch (condition) {
        case 'EQ':
          queryParams.KeyConditionExpression += ` AND #sk = :skv`;
          queryParams.ExpressionAttributeNames!['#sk'] = sortKey;
          queryParams.ExpressionAttributeValues![':skv'] = value as SimpleID;
          break;
        case 'LT':
          queryParams.KeyConditionExpression += ` AND #sk < :skv`;
          queryParams.ExpressionAttributeNames!['#sk'] = sortKey;
          queryParams.ExpressionAttributeValues![':skv'] = value as SimpleID;
          break;
        case 'LE':
          queryParams.KeyConditionExpression += ` AND #sk <= :skv`;
          queryParams.ExpressionAttributeNames!['#sk'] = sortKey;
          queryParams.ExpressionAttributeValues![':skv'] = value as SimpleID;
          break;
        case 'GT':
          queryParams.KeyConditionExpression += ` AND #sk > :skv`;
          queryParams.ExpressionAttributeNames!['#sk'] = sortKey;
          queryParams.ExpressionAttributeValues![':skv'] = value as SimpleID;
          break;
        case 'GE':
          queryParams.KeyConditionExpression += ` AND #sk >= :skv`;
          queryParams.ExpressionAttributeNames!['#sk'] = sortKey;
          queryParams.ExpressionAttributeValues![':skv'] = value as SimpleID;
          break;
        case 'BEGINS_WITH':
          queryParams.KeyConditionExpression += ` AND begins_with(#sk, :skv)`;
          queryParams.ExpressionAttributeNames!['#sk'] = sortKey;
          queryParams.ExpressionAttributeValues![':skv'] = value as SimpleID;
          break;
        case 'BETWEEN':
          if (!Array.isArray(value) || value.length !== 2) {
            throw new Error('BETWEEN condition requires exactly two values');
          }
          queryParams.KeyConditionExpression += ` AND #sk BETWEEN :skv1 AND :skv2`;
          queryParams.ExpressionAttributeNames!['#sk'] = sortKey;
          queryParams.ExpressionAttributeValues![':skv1'] = value[0];
          queryParams.ExpressionAttributeValues![':skv2'] = value[1];
          break;
        default:
          throw new Error(`Unsupported sort key condition: ${condition}`);
      }
    }

    if (options) {
      if (options.scanIndexForward !== undefined) {
        queryParams.ScanIndexForward = options.scanIndexForward;
      }

      if (options.filterExpression) {
        queryParams.FilterExpression = options.filterExpression;

        if (options.expressionAttributeNames) {
          queryParams.ExpressionAttributeNames = {
            ...queryParams.ExpressionAttributeNames,
            ...options.expressionAttributeNames
          };
        }

        if (options.expressionAttributeValues) {
          queryParams.ExpressionAttributeValues = {
            ...queryParams.ExpressionAttributeValues,
            ...options.expressionAttributeValues
          };
        }
      }
    }

    return queryParams;
  }

  private async _save<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K,
    entity: T[K] extends DynaBridgeEntity<infer U> ? U : never
  ): Promise<void> {
    const tableName = this._entityTypes[type].tableName;
    const currentVersion = (this._entityTypes[type].migrations?.length ?? 0) + 1;
    return putItem(ddbClient, tableName, currentVersion, entity as Record<string, any>);
  }

  private async _saveBatch<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K,
    entities: (T[K] extends DynaBridgeEntity<infer U> ? U : never)[]
  ): Promise<void> {
    const tableName = this._entityTypes[type].tableName;
    const currentVersion = (this._entityTypes[type].migrations?.length ?? 0) + 1;
    return writeBatchItem(ddbClient, tableName, currentVersion, entities as Record<string, any>[]);
  }

  private async _delete<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K,
    entity: T[K] extends DynaBridgeEntity<infer U> ? U : never
  ): Promise<void> {
    return deleteItem(ddbClient, this._entityTypes[type].tableName, this._getKeyFromEntity(type, entity));
  }

  private async _deleteBatch<K extends keyof T>(
    ddbClient: DynamoDBClient,
    type: K,
    entities: (T[K] extends DynaBridgeEntity<infer U> ? U : never)[]
  ): Promise<void> {
    return deleteBatchItem(
      ddbClient,
      this._entityTypes[type].tableName,
      entities.map((entity) => this._getKeyFromEntity(type, entity))
    );
  }

  private async _deleteById<K extends keyof T>(ddbClient: DynamoDBClient, type: K, id: ID): Promise<void> {
    return deleteItem(ddbClient, this._entityTypes[type].tableName, this._createKey(type, id));
  }

  private async _deleteByIds<K extends keyof T>(ddbClient: DynamoDBClient, type: K, ids: ID[]): Promise<void> {
    return deleteBatchItem(
      ddbClient,
      this._entityTypes[type].tableName,
      ids.map((id) => this._createKey(type, id))
    );
  }

  private _migrate = (entity: unknown, version: number, migrations?: Migrations<any>) => {
    if (!migrations) {
      return entity;
    }

    if (Array.isArray(migrations)) {
      if (version > migrations.length) {
        return entity;
      }
      return migrations.slice(version - 1).reduce((current, migration) => {
        return migration(current);
      }, entity);
    }

    if (version === 1) {
      return migrations(entity);
    }

    return entity;
  };

  private _createKey<K extends keyof T>(type: K, idValue: ID): Record<string, NativeAttributeValue> {
    const idDef = this._entityTypes[type].id;

    if (Array.isArray(idDef) && Array.isArray(idValue)) {
      if (idDef.length !== idValue.length) {
        throw new Error(`Could not create key for ${String(type)} as id keys and values length do not match.`);
      }

      return idDef.reduce(
        (currentId, key) => {
          currentId[key] = idValue.at(Object.keys(currentId).length)!;
          return currentId;
        },
        {} as Record<string, string | number>
      );
    } else if (!Array.isArray(idDef) && !Array.isArray(idValue)) {
      return { [idDef]: idValue };
    }

    throw new Error(`Could not create key for ${String(type)} as id keys and values types do not match.`);
  }

  private _getKeyFromEntity<K extends keyof T>(
    type: K,
    entity: T[K] extends DynaBridgeEntity<infer U> ? U : never
  ): Record<string, NativeAttributeValue> {
    const idDef = this._entityTypes[type].id;

    if (Array.isArray(idDef)) {
      return idDef.reduce(
        (currentId, key) => {
          currentId[key] = (entity as Record<string, SimpleID>)[key];
          return currentId;
        },
        {} as Record<string, SimpleID>
      );
    }

    return { [idDef]: (entity as Record<string, any>)[idDef] };
  }
}

export { DynaBridge, DynaBridgeEntity };
