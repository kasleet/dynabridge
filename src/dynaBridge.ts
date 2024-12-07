import { DynamoDBClient, ReturnValuesOnConditionCheckFailure } from '@aws-sdk/client-dynamodb';
import { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb/dist-types/DynamoDBClient';
import {
  deleteBatchItem,
  deleteItem,
  getBatchItem,
  getItem,
  putItem,
  scan,
  transactWrite,
  writeBatchItem
} from './dynamodb';
import { NativeAttributeValue, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { DynaBridgeEntity, ID, Migrations, SimpleID } from './types';

type EntityCommands<T extends Record<string, DynaBridgeEntity<any>>> = {
  [K in keyof T]: T[K] & {
    findById: (id: ID) => Promise<T[K] extends DynaBridgeEntity<infer U> ? U | undefined : never>;
    findByIds: (ids: ID[]) => Promise<(T[K] extends DynaBridgeEntity<infer U> ? U : never)[]>;
    findAll: () => Promise<(T[K] extends DynaBridgeEntity<infer U> ? U : never)[]>;
    save: (entity: T[K] extends DynaBridgeEntity<infer U> ? U : never) => Promise<void>;
    saveBatch: (entity: (T[K] extends DynaBridgeEntity<infer U> ? U : never)[]) => Promise<void>;
    delete: (entity: T[K] extends DynaBridgeEntity<infer U> ? U : never) => Promise<void>;
    deleteBatch: (entity: (T[K] extends DynaBridgeEntity<infer U> ? U : never)[]) => Promise<void>;
    deleteById: (id: ID) => Promise<void>;
    deleteByIds: (ids: ID[]) => Promise<void>;
  };
};

class DynaBridge<T extends Record<string, DynaBridgeEntity<any>>> {
  public entities: EntityCommands<T>;

  private readonly _entityTypes: T;
  private readonly ddbClient: DynamoDBClient;

  constructor(entities: T, config?: DynamoDBClientConfig) {
    this._entityTypes = entities;
    this.ddbClient = new DynamoDBClient(config ?? {});

    this.entities = {} as EntityCommands<T>;

    Object.keys(entities).forEach((key) => {
      this.entities[key as keyof T] = {
        ...entities[key],
        findById: this._findById.bind(this, this.ddbClient, key),
        findByIds: this._findByIds.bind(this, this.ddbClient, key),
        findAll: this._findAll.bind(this, this.ddbClient, key),
        save: this._save.bind(this, this.ddbClient, key),
        saveBatch: this._saveBatch.bind(this, this.ddbClient, key),
        delete: this._delete.bind(this, this.ddbClient, key),
        deleteBatch: this._deleteBatch.bind(this, this.ddbClient, key),
        deleteById: this._deleteById.bind(this, this.ddbClient, key),
        deleteByIds: this._deleteByIds.bind(this, this.ddbClient, key)
      } as EntityCommands<T>[keyof T];
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
          return { TableName: tableName, Item: item };
        case 'Update':
          return {
            TableName: tableName,
            Key: this._getKeyFromEntity(type, entity),
            UpdateExpression: operation.updateExpression,
            ConditionExpression: operation.conditionExpression,
            ExpressionAttributeNames: operation.expressionAttributeNames,
            ExpressionAttributeValues: operation.expressionAttributeValues,
            ReturnValuesOnConditionCheckFailure: operation.returnValuesOnConditionCheckFailure
          };
        case 'Delete':
          return { TableName: tableName, Key: this._getKeyFromEntity(type, entity) };
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
