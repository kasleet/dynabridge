import { beforeEach, expect, test, vi } from 'vitest';
import { BatchGetItemCommand, DeleteItemCommand, DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynaBridge } from '../src';
import { companyEntity } from './simple/repository/companyEntity';
import { employeeEntity } from './simple/repository/employeeEntity';
import { Company } from './simple/domain/Company';
import { Employee } from './simple/domain/Employee';
import {
  BatchWriteCommand,
  DynamoDBDocument,
  PutCommand,
  ScanCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';

const dynamORM = new DynaBridge({
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

test('save entities', async () => {
  const company: Company = {
    id: 'company-1',
    name: 'Test Company'
  };
  const employee: Employee = {
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar'
  };

  dynamoDbDocumentClientMock.on(PutCommand).resolves(Promise.resolve({}));

  await dynamORM.entities.company.save(company);
  await dynamORM.entities.employee.save(employee);

  expect(dynamoDbDocumentClientMock.calls().at(0)?.firstArg.input.Item).toEqual({
    id: 'company-1',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  });
  expect(dynamoDbDocumentClientMock.calls().at(1)?.firstArg.input.Item).toEqual({
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  });
});

test('save all entities', async () => {
  const company1: Company = {
    id: 'company-1',
    name: 'Test Company'
  };
  const company2: Company = {
    id: 'company-2',
    name: 'Test Company'
  };

  dynamoDbDocumentClientMock.on(BatchWriteCommand).resolves(Promise.resolve({}));

  await dynamORM.entities.company.saveBatch([company1, company2]);

  expect(dynamoDbDocumentClientMock.calls().at(0)?.firstArg.input.RequestItems).toEqual({
    [companyEntity.tableName]: [
      {
        PutRequest: {
          Item: {
            id: 'company-1',
            name: 'Test Company',
            _version: 1,
            _updated_at: '2020-01-01T00:00:00.000Z'
          }
        }
      },
      {
        PutRequest: {
          Item: {
            id: 'company-2',
            name: 'Test Company',
            _version: 1,
            _updated_at: '2020-01-01T00:00:00.000Z'
          }
        }
      }
    ]
  });
});

test('find entities by id', async () => {
  const persistedCompany = {
    id: 'company-1',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedEmployee = {
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbClientMock
    .on(GetItemCommand)
    .resolvesOnce({ Item: marshall(persistedCompany) })
    .resolvesOnce({ Item: marshall(persistedEmployee) });

  const company = await dynamORM.entities.company.findById('company-1');
  const employee = await dynamORM.entities.employee.findById(['company-1', 1]);

  expect(company).toEqual({
    id: 'company-1',
    name: 'Test Company'
  });
  expect(employee).toEqual({
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar'
  });
});

test('find multiple entities by id', async () => {
  const persistedCompany1 = {
    id: 'company-1',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedCompany2 = {
    id: 'company-2',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbClientMock.on(BatchGetItemCommand).resolves({
    Responses: {
      [companyEntity.tableName]: [marshall(persistedCompany1), marshall(persistedCompany2)]
    }
  });

  const companies = await dynamORM.entities.company.findByIds(['company-1', 'company-2']);

  expect(companies).toEqual([
    {
      id: 'company-1',
      name: 'Test Company'
    },
    {
      id: 'company-2',
      name: 'Test Company'
    }
  ]);
});

test('find all entities', async () => {
  const persistedCompany1 = {
    id: 'company-1',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };
  const persistedCompany2 = {
    id: 'company-2',
    name: 'Test Company',
    _version: 1,
    _updated_at: '2020-01-01T00:00:00.000Z'
  };

  dynamoDbDocumentClientMock.on(ScanCommand).resolves({ Items: [persistedCompany1, persistedCompany2] });

  const allCompanies = await dynamORM.entities.company.findAll();

  expect(allCompanies).toEqual([
    {
      id: 'company-1',
      name: 'Test Company'
    },
    {
      id: 'company-2',
      name: 'Test Company'
    }
  ]);
});

test('delete entities', async () => {
  dynamoDbClientMock.on(DeleteItemCommand).resolves(Promise.resolve({}));

  const employee: Employee = {
    companyId: 'company-1',
    employeeNumber: 2,
    firstName: 'Foo',
    lastName: 'Bar'
  };

  await dynamORM.entities.company.deleteById('company-1');
  await dynamORM.entities.employee.deleteById(['company-1', 1]);
  await dynamORM.entities.employee.delete(employee);

  expect(dynamoDbClientMock.calls().at(0)?.firstArg.input.Key).toEqual(marshall({ id: 'company-1' }));
  expect(dynamoDbClientMock.calls().at(1)?.firstArg.input.Key).toEqual(
    marshall({ companyId: 'company-1', employeeNumber: 1 })
  );
  expect(dynamoDbClientMock.calls().at(2)?.firstArg.input.Key).toEqual(
    marshall({ companyId: 'company-1', employeeNumber: 2 })
  );
});

test('save multiple entities in transaction', async () => {
  const company: Company = {
    id: 'company-1',
    name: 'Test Company'
  };
  const employee1: Employee = {
    companyId: 'company-1',
    employeeNumber: 1,
    firstName: 'Foo',
    lastName: 'Bar'
  };
  const employee2: Employee = {
    companyId: 'company-1',
    employeeNumber: 2,
    firstName: 'Alice',
    lastName: 'Bob'
  };
  const employee3: Employee = {
    companyId: 'company-1',
    employeeNumber: 3,
    firstName: 'John',
    lastName: 'Doe'
  };

  dynamoDbDocumentClientMock.on(TransactWriteCommand).resolves(Promise.resolve({}));

  await dynamORM.transaction([
    { action: 'Put', type: 'company', entity: company },
    { action: 'Put', type: 'employee', entity: employee1 },
    {
      action: 'Update',
      type: 'employee',
      entity: employee2,
      updateExpression: 'SET #firstName = :newName',
      expressionAttributeValues: { ':newName': 'Charlie' }
    },
    { action: 'Delete', type: 'employee', entity: employee3 }
  ]);

  expect(dynamoDbDocumentClientMock.calls().at(0)?.firstArg.input.TransactItems).toEqual([
    {
      TableName: 'company-739ab4',
      Item: {
        id: 'company-1',
        name: 'Test Company',
        _version: 1,
        _updated_at: '2020-01-01T00:00:00.000Z'
      }
    },
    {
      TableName: 'employee-739ab4',
      Item: {
        companyId: 'company-1',
        employeeNumber: 1,
        firstName: 'Foo',
        lastName: 'Bar',
        _version: 1,
        _updated_at: '2020-01-01T00:00:00.000Z'
      }
    },
    {
      TableName: 'employee-739ab4',
      Key: {
        companyId: 'company-1',
        employeeNumber: 2
      },
      UpdateExpression: 'SET #firstName = :newName',
      ExpressionAttributeValues: {
        ':newName': 'Charlie'
      }
    },
    {
      TableName: 'employee-739ab4',
      Key: {
        companyId: 'company-1',
        employeeNumber: 3
      }
    }
  ]);
});
