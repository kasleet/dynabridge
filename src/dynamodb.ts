import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  BatchGetItemCommand,
  BatchGetItemCommandInput,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand
} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommandInput,
  DynamoDBDocument,
  ScanCommandOutput,
  TransactWriteCommandInput
} from '@aws-sdk/lib-dynamodb';

export const getItem = async <T>(
  ddbClient: DynamoDBClient,
  tableName: string,
  key: object
): Promise<{ entity: T; version: number } | undefined> => {
  const command = new GetItemCommand({
    TableName: tableName,
    Key: marshall(key)
  });

  const result = await ddbClient.send(command);

  if (result.Item) {
    const persistedItem = unmarshall(result.Item);
    const { _version, _updated_at, ...entity } = persistedItem;
    return {
      entity: entity as T,
      version: _version
    };
  }

  return undefined;
};

export const putItem = async <T extends Record<string, any>>(
  ddbClient: DynamoDBClient,
  tableName: string,
  version: number,
  entity: T
): Promise<void> => {
  const document = DynamoDBDocument.from(ddbClient, {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });

  const entityWithMetadata = {
    ...entity,
    _version: version,
    _updated_at: new Date().toISOString()
  };

  await document.put({
    TableName: tableName,
    Item: entityWithMetadata
  });
};

export const getBatchItem = async <T>(
  ddbClient: DynamoDBClient,
  tableName: string,
  keys: object[]
): Promise<{ entity: T; version: number }[]> => {
  if (!keys || keys.length === 0) {
    return [];
  }

  const idChunks = getChunks(keys);

  const allItems = [];

  for (const idChunk of idChunks) {
    const chunkItems = [];

    let chunkTry = 0;
    let chunkRetrievedSuccessfully = false;
    let itemsToGet: BatchGetItemCommandInput = {
      RequestItems: {
        [tableName]: {
          Keys: idChunk.map((id) => marshall(id))
        }
      }
    };

    while (!chunkRetrievedSuccessfully) {
      if (chunkTry < 3) {
        const res = await ddbClient.send(new BatchGetItemCommand(itemsToGet));

        const potentialItems =
          res.Responses?.[tableName]?.map((item) => {
            const persistedItem = unmarshall(item);
            const { _version, _updated_at, ...entity } = persistedItem;
            return {
              entity: entity as T,
              version: _version
            };
          }) ?? [];

        chunkItems.push(...potentialItems);

        if (res.UnprocessedKeys && Object.keys(res.UnprocessedKeys).length > 0) {
          itemsToGet = { RequestItems: res.UnprocessedKeys };
          chunkTry = chunkTry + 1;
        } else {
          allItems.push(...chunkItems);
          chunkRetrievedSuccessfully = true;
        }
      } else {
        throw new Error('Failed after 3 retries getting chunk.');
      }
    }
  }

  if (!allItems || allItems.length === 0) {
    return [];
  }

  return allItems;
};

export const writeBatchItem = async <T extends Record<string, any>>(
  ddbClient: DynamoDBClient,
  tableName: string,
  version: number,
  entities: T[]
): Promise<void> => {
  if (entities.length === 0) {
    return;
  }

  const entitiesWithMetadata = entities.map((entity) => ({
    ...entity,
    _version: version,
    _updated_at: new Date().toISOString()
  }));

  const translateConfig = {
    marshallOptions: { removeUndefinedValues: true }
  };
  const dynamoDocClient = DynamoDBDocument.from(ddbClient, translateConfig);

  const chunks = getChunks(entitiesWithMetadata);

  for (const chunk of chunks) {
    let chunkTry = 0;
    let chunkWrittenSuccessfully = false;
    let itemsToWrite: BatchWriteCommandInput = {
      RequestItems: {
        [tableName]: chunk.map((item) => ({
          PutRequest: {
            Item: item
          }
        }))
      }
    };

    while (!chunkWrittenSuccessfully) {
      if (chunkTry < 3) {
        const res = await dynamoDocClient.batchWrite(itemsToWrite);
        if (res.UnprocessedItems && Object.keys(res.UnprocessedItems).length > 0) {
          itemsToWrite = { RequestItems: res.UnprocessedItems };
          chunkTry = chunkTry + 1;
        } else {
          chunkWrittenSuccessfully = true;
        }
      } else {
        throw new Error('Failed after 3 retries writing chunk.');
      }
    }
  }
};

export const deleteBatchItem = async <T extends Record<string, any>>(
  ddbClient: DynamoDBClient,
  tableName: string,
  keys: object[]
): Promise<void> => {
  if (keys.length === 0) {
    return;
  }

  const dynamoDocClient = DynamoDBDocument.from(ddbClient);

  const chunks = getChunks(keys);

  for (const chunk of chunks) {
    let chunkTry = 0;
    let chunkDeletedSuccessfully = false;
    let itemsToDelete: BatchWriteCommandInput = {
      RequestItems: {
        [tableName]: chunk.map((key) => ({
          DeleteRequest: {
            Key: key
          }
        }))
      }
    };

    while (!chunkDeletedSuccessfully) {
      if (chunkTry < 3) {
        const res = await dynamoDocClient.batchWrite(itemsToDelete);
        if (res.UnprocessedItems && Object.keys(res.UnprocessedItems).length > 0) {
          itemsToDelete = { RequestItems: res.UnprocessedItems };
          chunkTry = chunkTry + 1;
        } else {
          chunkDeletedSuccessfully = true;
        }
      } else {
        throw new Error('Failed after 3 retries writing chunk.');
      }
    }
  }
};

export const scan = async <T>(
  ddbClient: DynamoDBClient,
  tableName: string
): Promise<{ entity: T; version: number }[]> => {
  const scanParams: { TableName: string; ExclusiveStartKey: Record<string, any> | undefined } = {
    TableName: tableName,
    ExclusiveStartKey: undefined
  };

  const documentClient = DynamoDBDocument.from(ddbClient);

  const scanResults: { entity: T; version: number }[] = [];

  let items: ScanCommandOutput;
  do {
    items = await documentClient.scan(scanParams);
    items.Items?.forEach((item) => {
      const { _version, _updated_at, ...entity } = item;
      scanResults.push({
        entity: entity as T,
        version: _version
      });
    });
    scanParams.ExclusiveStartKey = items.LastEvaluatedKey;
  } while (typeof items.LastEvaluatedKey !== 'undefined');

  return scanResults;
};

export const transactWrite = async <T>(
  ddbClient: DynamoDBClient,
  transactItems: TransactWriteCommandInput['TransactItems']
): Promise<void> => {
  const document = DynamoDBDocument.from(ddbClient, {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });

  await document.transactWrite({
    TransactItems: transactItems
  });
};

export const deleteItem = async <T>(ddbClient: DynamoDBClient, tableName: string, key: object): Promise<void> => {
  const command = new DeleteItemCommand({
    TableName: tableName,
    Key: marshall(key)
  });

  await ddbClient.send(command);
};

const getChunks = (items: object[]): object[][] => {
  const CHUNK_SIZE = 100;
  return [...Array(Math.ceil(items.length / CHUNK_SIZE)).keys()].map((index) =>
    items.slice(CHUNK_SIZE * index, CHUNK_SIZE + CHUNK_SIZE * index)
  );
};
