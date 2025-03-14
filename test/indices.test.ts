import { beforeEach, expect, test, vi } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynaBridge } from '../src';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { employeeEntity } from './indices/repository/employeeEntity';

const db = new DynaBridge({
  employee: employeeEntity
});

const dynamoDbClientMock = mockClient(DynamoDBClient);

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date(Date.UTC(2020, 0, 1)));
  dynamoDbClientMock.reset();
});

test('query entities', async () => {
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

  const res = await db.entities.employee.query('byCountry', 'Germany');

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
