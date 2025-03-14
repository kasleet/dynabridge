import { beforeEach, expect, test, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynaBridge } from '../src';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { employeeEntity } from './indices/repository/employeeEntity';

const db = new DynaBridge({
  employee: employeeEntity
});

const dynamoDbClientMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date(Date.UTC(2020, 0, 1)));
  dynamoDbClientMock.reset();
});

test('query entities from table', async () => {
  const employee1 = {
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar',
    country: 'Germany',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbClientMock.on(QueryCommand).resolves({ Items: [employee1] });

  const res = await db.entities.employee.query('company-1');

  expect(res).toEqual([
    {
      companyId: 'company-1',
      employeeNumber: 1,
      firstName: 'Foo',
      lastName: 'Bar',
      country: 'Germany'
    }
  ]);
});

test('query entities from index', async () => {
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
