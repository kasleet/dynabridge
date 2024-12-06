import { beforeEach, expect, test, vi } from 'vitest';
import { BatchGetItemCommand, DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';
import { Dynabridge } from '../src';
import { companyEntity } from './migration/repository/companyEntity';
import { employeeEntity } from './migration/repository/employeeEntity';
import { DynamoDBDocument, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamORM = new Dynabridge({
  company: companyEntity,
  employee: employeeEntity
});

const dynamoDbClientMock = mockClient(DynamoDBClient);
const dynamoDbDocumentClientMock = mockClient(DynamoDBDocument);

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date(Date.UTC(2020, 0, 1)));
  dynamoDbClientMock.reset();
  dynamoDbDocumentClientMock.reset();
});

test('return latest version of persisted entity', async () => {
  const persistedCompanyV1 = {
    id: 'company-1',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedCompanyLatest = {
    id: 'company-2',
    name: 'Test Company',
    industry: 'Finance',
    _version: 2,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedEmployeeV1 = {
    id: 'employee-1',
    companyId: 'company-1',
    firstName: 'Foo',
    lastName: 'Bar',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedEmployeeV2 = {
    id: 'employee-2',
    companyId: 'company-1',
    firstName: 'Foo',
    lastName: 'Bar',
    role: 'Human Resources',
    _version: 2,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedEmployeeLatest = {
    id: 'employee-3',
    companyId: 'company-1',
    firstName: 'Foo',
    lastName: 'Bar',
    role: 'Developer',
    _version: 3,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbClientMock
    .on(GetItemCommand)
    .resolvesOnce({ Item: marshall(persistedCompanyV1) })
    .resolvesOnce({ Item: marshall(persistedCompanyLatest) })
    .resolvesOnce({ Item: marshall(persistedEmployeeV1) })
    .resolvesOnce({ Item: marshall(persistedEmployeeV2) })
    .resolvesOnce({ Item: marshall(persistedEmployeeLatest) });

  const companyV1 = await dynamORM.entities.company.findById('company-1');
  const companyLatest = await dynamORM.entities.company.findById('company-2');
  const employeeV1 = await dynamORM.entities.employee.findById(['company-1', 'employee-1']);
  const employeeV2 = await dynamORM.entities.employee.findById(['company-1', 'employee-2']);
  const employeeLatest = await dynamORM.entities.employee.findById(['company-1', 'employee-3']);

  expect(companyV1).toEqual({
    id: 'company-1',
    name: 'Test Company',
    industry: 'Other'
  });
  expect(companyLatest).toEqual({
    id: 'company-2',
    name: 'Test Company',
    industry: 'Finance'
  });
  expect(employeeV1).toEqual({
    id: 'employee-1',
    companyId: 'company-1',
    firstName: 'Foo',
    lastName: 'Bar',
    role: 'Other'
  });
  expect(employeeV2).toEqual({
    id: 'employee-2',
    companyId: 'company-1',
    firstName: 'Foo',
    lastName: 'Bar',
    role: 'HR'
  });
  expect(employeeLatest).toEqual({
    id: 'employee-3',
    companyId: 'company-1',
    firstName: 'Foo',
    lastName: 'Bar',
    role: 'Developer'
  });
});

test('return latest version of persisted entities', async () => {
  const persistedCompany1 = {
    id: 'company-1',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedCompanyLatest = {
    id: 'company-2',
    name: 'Test Company',
    industry: 'Finance',
    _version: 2,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbClientMock.on(BatchGetItemCommand).resolves({
    Responses: {
      [companyEntity.tableName]: [marshall(persistedCompany1), marshall(persistedCompanyLatest)]
    }
  });

  const allCompanies = await dynamORM.entities.company.findByIds(['company-1', 'company-2']);

  expect(allCompanies).toEqual([
    {
      id: 'company-1',
      name: 'Test Company',
      industry: 'Other'
    },
    {
      id: 'company-2',
      name: 'Test Company',
      industry: 'Finance'
    }
  ]);
});

test('return latest version of all persisted entities', async () => {
  const persistedCompany1 = {
    id: 'company-1',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedCompanyLatest = {
    id: 'company-2',
    name: 'Test Company',
    industry: 'Finance',
    _version: 2,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbDocumentClientMock
    .on(ScanCommand)
    .resolves({ Items: [persistedCompany1, persistedCompanyLatest] });

  const allCompanies = await dynamORM.entities.company.findAll();

  expect(allCompanies).toEqual([
    {
      id: 'company-1',
      name: 'Test Company',
      industry: 'Other'
    },
    {
      id: 'company-2',
      name: 'Test Company',
      industry: 'Finance'
    }
  ]);
});
