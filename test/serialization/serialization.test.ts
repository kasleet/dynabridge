import { beforeEach, expect, test, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynaBridge, DynaBridgeEntity } from '../../src';
import { mapDatesToString, mapStringsToDate } from './dateUtil';
import { DynamoDBDocument, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

export interface Employee {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  startedAt: Date;
}

export const employeeEntity: DynaBridgeEntity<Employee> = {
  tableName: 'employee-739ab4',
  id: ['companyId', 'employeeNumber']
};

const db = new DynaBridge(
  {
    employee: employeeEntity
  },
  {
    serialize: (entity) => mapDatesToString(entity),
    deserialize: (entity) => mapStringsToDate(entity)
  }
);

const dynamoDbClientMock = mockClient(DynamoDBClient);
const dynamoDbDocumentClientMock = mockClient(DynamoDBDocument);

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date(Date.UTC(2020, 0, 1)));
  dynamoDbDocumentClientMock.reset();
});

test('serialize entity before saving', async () => {
  const employee = {
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar',
    startedAt: new Date(),
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbDocumentClientMock.on(PutCommand).resolves(Promise.resolve({}));

  await db.entities.employee.save(employee);

  expect(dynamoDbDocumentClientMock.calls().at(0)?.firstArg.input.Item).toEqual({
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar',
    startedAt: '2020-01-01T00:00:00.000Z',
    _updated_at: '2020-01-01T00:00:00.000Z',
    _version: 1
  });
});

test('deserialize entity after fetching', async () => {
  const persistedEmployee = {
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar',
    startedAt: '2020-01-01T00:00:00.000Z',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbClientMock.on(GetItemCommand).resolvesOnce({ Item: marshall(persistedEmployee) });

  const employee = await db.entities.employee.findById(['company-1', 1]);

  dynamoDbDocumentClientMock.on(PutCommand).resolves(Promise.resolve({}));

  expect(employee).toEqual({
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar',
    startedAt: new Date()
  });
});
