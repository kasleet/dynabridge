import { beforeEach, expect, test, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynaBridge, DynaBridgeEntity } from '../src';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

export interface Employee {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  country: string;
}

export const employeeEntity: DynaBridgeEntity<Employee, 'byCountry'> = {
  tableName: 'employee-739ab4',
  id: ['companyId', 'employeeNumber'],
  index: {
    byCountry: {
      indexName: 'employee-country-index-abdc23',
      hashKey: 'country'
    }
  }
};

const db = new DynaBridge({
  employee: employeeEntity
});

const dynamoDbClientMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date(Date.UTC(2020, 0, 1)));
  dynamoDbClientMock.reset();
});

test('find entities using index query', async () => {
  const employee1 = {
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar',
    country: 'Germany',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  const employee2 = {
    companyId: 'company-2',
    employeeNumber: 1,
    firstName: 'Alice',
    lastName: 'Bob',
    country: 'Germany',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbClientMock.on(QueryCommand).resolves({ Items: [employee1, employee2] });

  const res = await db.entities.employee.queryIndex('byCountry', 'Germany');

  expect(res).toEqual([
    {
      companyId: 'company-1',
      employeeNumber: 1,
      firstName: 'Foo',
      lastName: 'Bar',
      country: 'Germany'
    },
    {
      companyId: 'company-2',
      employeeNumber: 1,
      firstName: 'Alice',
      lastName: 'Bob',
      country: 'Germany'
    }
  ]);
});
