import { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import { T } from 'vitest/dist/chunks/global.CnI8_G5V';

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

type Serializer = {
  serialize: (entity: any) => any;
  deserialize: (entity: any) => any;
};

export { DynaBridgeEntity, ID, Migrations, SimpleID, SortKeyCondition, QueryOptions, EntityCommands, Serializer };
