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
import {
  DynaBridgeEntity,
  EntityCommands,
  ID,
  Migrations,
  QueryOptions,
  Serializer,
  SimpleID,
  SortKeyCondition
} from './types';

class DynaBridge<T extends Record<string, DynaBridgeEntity>> {
  public entities: EntityCommands<T>;

  private readonly _entityTypes: T;
  private readonly ddbClient: DynamoDBClient;
  private readonly serializer: Serializer;

  constructor(entities: T, serializer?: Serializer, config?: DynamoDBClientConfig) {
    this._entityTypes = entities;
    this.ddbClient = new DynamoDBClient(config ?? {});
    this.serializer = {
      serialize: (entity) => entity,
      deserialize: (entity) => entity
    };

    if (serializer) {
      this.serializer = serializer;
    }

    this.entities = {} as EntityCommands<T>;

    Object.keys(entities).forEach((key) => {
      const entityKey = key as keyof T;

      (this.entities[entityKey] as any) = {
        ...entities[entityKey],
        findById: this._findById.bind(this, entityKey),
        findByIds: this._findByIds.bind(this, entityKey),
        findAll: this._findAll.bind(this, entityKey),
        save: this._save.bind(this, entityKey),
        saveBatch: this._saveBatch.bind(this, entityKey),
        delete: this._delete.bind(this, entityKey),
        deleteBatch: this._deleteBatch.bind(this, entityKey),
        deleteById: this._deleteById.bind(this, entityKey),
        deleteByIds: this._deleteByIds.bind(this, entityKey),
        queryIndex: this._queryIndex.bind(this, entityKey),
        query: this._queryTable.bind(this, entityKey)
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
          const serialized = this.serializer.serialize(entity) as Record<string, any>;
          const item = {
            ...serialized,
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
    type: K,
    id: ID
  ): Promise<T[K] extends DynaBridgeEntity<infer U> ? U | undefined : never> {
    const getItemRes = await getItem(this.ddbClient, this._entityTypes[type].tableName, this._createKey(type, id));
    if (!getItemRes) {
      return undefined as never;
    }

    const migrations = this._entityTypes[type].migrations;

    const migratedEntity = this._migrate(getItemRes.entity, getItemRes.version, migrations);

    return this.serializer.deserialize(migratedEntity);
  }

  private async _findByIds<K extends keyof T>(
    type: K,
    ids: ID[]
  ): Promise<(T[K] extends DynaBridgeEntity<infer U> ? U : never)[]> {
    const getBatchResult = await getBatchItem(
      this.ddbClient,
      this._entityTypes[type].tableName,
      ids.map((id) => this._createKey(type, id))
    );
    const migrations = this._entityTypes[type].migrations;
    return getBatchResult.map((res) => {
      const migrated = this._migrate(res.entity, res.version, migrations) as T[K] extends DynaBridgeEntity<infer U>
        ? U
        : never;
      return this.serializer.deserialize(migrated);
    });
  }

  private async _findAll<K extends keyof T>(type: K): Promise<(T[K] extends DynaBridgeEntity<infer U> ? U : never)[]> {
    const scanResult = await scan(this.ddbClient, this._entityTypes[type].tableName);
    const migrations = this._entityTypes[type].migrations;
    return scanResult.map((res) => {
      const migrated = this._migrate(res.entity, res.version, migrations) as T[K] extends DynaBridgeEntity<infer U>
        ? U
        : never;
      return this.serializer.deserialize(migrated);
    });
  }

  private async _queryIndex<K extends keyof T>(
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

    const queryResult = await query(this.ddbClient, queryParams);

    return queryResult.map((res) => {
      const migrated = this._migrate(res.entity, res.version, migrations) as T[K] extends DynaBridgeEntity<infer U, any>
        ? U
        : never;
      return this.serializer.deserialize(migrated);
    });
  }

  private async _queryTable<K extends keyof T>(
    type: K,
    hashKeyValue: SimpleID,
    sortKeyCondition?: SortKeyCondition,
    options?: QueryOptions
  ): Promise<(T[K] extends DynaBridgeEntity<infer U, any> ? U : never)[]> {
    const entityConfig = this._entityTypes[type];
    const tableName = entityConfig.tableName;
    const migrations = entityConfig.migrations;

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
      undefined,
      hashKey,
      hashKeyValue,
      sortKey,
      sortKeyCondition,
      options
    );

    const queryResult = await query(this.ddbClient, queryParams);

    return queryResult.map((res) => {
      const migrated = this._migrate(res.entity, res.version, migrations) as T[K] extends DynaBridgeEntity<infer U, any>
        ? U
        : never;
      return this.serializer.deserialize(migrated);
    });
  }

  private async _save<K extends keyof T>(
    type: K,
    entity: T[K] extends DynaBridgeEntity<infer U> ? U : never
  ): Promise<void> {
    const tableName = this._entityTypes[type].tableName;
    const currentVersion = (this._entityTypes[type].migrations?.length ?? 0) + 1;
    const serialized = this.serializer.serialize(entity);
    return putItem(this.ddbClient, tableName, currentVersion, serialized);
  }

  private async _saveBatch<K extends keyof T>(
    type: K,
    entities: (T[K] extends DynaBridgeEntity<infer U> ? U : never)[]
  ): Promise<void> {
    const tableName = this._entityTypes[type].tableName;
    const currentVersion = (this._entityTypes[type].migrations?.length ?? 0) + 1;
    const serialized = entities.map((entity) => this.serializer.serialize(entity));
    return writeBatchItem(this.ddbClient, tableName, currentVersion, serialized);
  }

  private async _delete<K extends keyof T>(
    type: K,
    entity: T[K] extends DynaBridgeEntity<infer U> ? U : never
  ): Promise<void> {
    return deleteItem(this.ddbClient, this._entityTypes[type].tableName, this._getKeyFromEntity(type, entity));
  }

  private async _deleteBatch<K extends keyof T>(
    type: K,
    entities: (T[K] extends DynaBridgeEntity<infer U> ? U : never)[]
  ): Promise<void> {
    return deleteBatchItem(
      this.ddbClient,
      this._entityTypes[type].tableName,
      entities.map((entity) => this._getKeyFromEntity(type, entity))
    );
  }

  private async _deleteById<K extends keyof T>(type: K, id: ID): Promise<void> {
    return deleteItem(this.ddbClient, this._entityTypes[type].tableName, this._createKey(type, id));
  }

  private async _deleteByIds<K extends keyof T>(type: K, ids: ID[]): Promise<void> {
    return deleteBatchItem(
      this.ddbClient,
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
}

export { DynaBridge, DynaBridgeEntity, Serializer };
