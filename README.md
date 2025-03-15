<p align="center">
  <img alt="dynabridge logo" height="150px" src="./static/logo.png" />  
</p>
<h1 align="center">DynaBridge</h1>

![](https://img.shields.io/github/license/kasleet/dynabridge?style=flat)
[![](https://img.shields.io/github/actions/workflow/status/kasleet/dynabridge/ci.yaml?style=flat)](https://github.com/kasleet/dynabridge/actions/workflows/ci.yaml)
[![](https://img.shields.io/npm/v/dynabridge?style=flat)](https://www.npmjs.com/package/dynabridge)

Simple and light-weight TypeScript entity-focused wrapper for DynamoDB

Install via npm: `npm install dynabridge`

## Who is this intended for?

You have a full stack web application or some other Node server written in TypeScript, and you’re kind of
abusing DynamoDB as your relational database? Are you storing your entities in multiple tables, even though
Alex DeBrie has told you [over](https://www.youtube.com/watch?v=BnDKD_Zv0og&t=787s) and
[over](https://www.youtube.com/watch?v=PVUofrFiS_A) and
[over again](https://www.youtube.com/watch?v=hjqrDqVaiw0) not do it?

After attending multiple re:Invents, watching every YouTube video on Single Table Design,
and surviving a two-week bootcamp on how to properly overload Global Secondary Indexes,
you might finally be able to implement a simple to-do application using the _DynamoDB_ way.
But the moment you need to add a feature with a new access pattern or explain it all to a colleague,
it feels like you’re on the verge of a nervous breakdown.

In the end, most of us know that DynamoDB is just not the right tool for our use case (especially
when requirements and access patterns change) but its just
so simple and dirt cheap - especially when building a serverless application using Lambda.

This library is here to ease the pain of abusing DynamoDB as a "relational database". It won’t make it _right_,
but it might make it a bit less painful by bridging the gap.

## What's the difference to other DynamoDB wrappers or ORMs?

There are plenty of other ORMs and wrappers for DynamoDB out there.
Many of them seem abandoned, lack traction, or just feel overly complex. There are definitely useful libraries out there,
but they have a different goal in mind. The aim of this library is to keep things as simple as possible, 
with a minimal footprint, while still providing all the essential features you need for your CRUD operations.

## Key features and selling points

- No use of decorators - keeping your types and interfaces clean
- Extremely easy to use
- Type-safe CRUD for your data model
- On-the-fly migrations

## Developing with DynaBridge

### A typical data model may look like this

```typescript
// src/domain/types.ts
export interface Company {
  id: string;
  name: string;
}

export interface Employee {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
}
```

### Setting up DynaBridge should be straight-forward

```typescript
// src/repository/index.ts
import { DynaBridge, DynaBridgeEntity } from 'dynabridge';
import { Company, Employee } from '../domain/types';

const companyEntity: DynaBridgeEntity<Company> = {
  tableName: 'company',
  id: 'id'
};

const employeeEntity: DynaBridgeEntity<Employee> = {
  tableName: 'employee',
  id: ['companyId', 'employeeNumber']
};

export const db = new DynaBridge({
  company: companyEntity,
  employee: employeeEntity
});
```

**Note**: The ID of `Company` is `id`, this means that the DynamoDB table needs to be configured
with a hash key with name `id` of type `string`. On the other hand, an `Employee` is
identified by the combination of the `companyId` and its `employeeNumber`, therefore its
DynamoDB table needs to have a hash key (`companyId` of type string) and a
range key (`employeeNumber`, type `number`). Setting up and deploying the DynamoDB tables
are outside DynaBridge scope and preferably done using some IaC tooling.

### Using the client in your application code

```typescript
// ./src/index.ts
import { db } from './repository';
import { Company, Employee } from './domain/types';

const someCompany1: Company = {
  id: 'c1',
  name: 'Test company 1'
};

const someCompany2: Company = {
  id: 'c2',
  name: 'Test company 2'
};

const someEmployee1: Employee = {
  companyId: 'c1',
  employeeNumber: 1,
  firstName: 'John',
  lastName: 'Doe'
};

const someEmployee2: Employee = {
  companyId: 'c1',
  employeeNumber: 2,
  firstName: 'Foo',
  lastName: 'Bar'
};
```

### Basic operations 

#### Write single entity

```typescript
await db.entities.company.save(someCompany1);
await db.entities.employee.save(someEmployee1);
```

#### Write multiple entities

```typescript
await db.entities.company.saveBatch([someCompany1, someCompany2]);
await db.entities.employee.saveBatch([someEmployee1, someEmployee2]);
```

#### Fetch entity by id

```typescript
const company: Company | undefined = await db.entities.company.findById('c1');
const employee: Employee | undefined = await db.entities.employee.findById(['c1', 1]);
```

#### Fetch multiple entities by id

```typescript
const companies: Company[] = await db.entities.company.findByIds(['c1', 'c2']);
const employees: Employee[] = await db.entities.employee.findByIds([['c1', 1], ['c1', 2]]);
```

#### Fetch multiple entities by hash key (table query)

```typescript
const employees: Employee[] = await db.entities.employee.query('c1');
```

#### Fetch all entities

```typescript
const allCompanies: Company[] = await db.entities.company.findAll();
const allEmployees: Employee[] = await db.entities.employee.findAll();
```

#### Delete entity

```typescript
await db.entities.company.delete(someCompany1);
await db.entities.employee.delete(someEmployee1);
```

#### Delete multiple entities

```typescript
await db.entities.company.deleteBatch([someCompany1, someCompany2]);
await db.entities.employee.deleteBatch([someEmployee1, someEmployee2]);
```

#### Delete entity by id

```typescript
await db.entities.company.deleteById('c1');
await db.entities.employee.deleteById(['c1', 1]);
```

#### Delete multiple entities by id

```typescript
await db.entities.company.deleteByIds(['c1', 'c2']);
await db.entities.employee.deleteByIds([['c1', 1], ['c1', 2]]);
```

#### Transaction

```typescript
await db.transaction([
  { action: 'Put', type: 'company', entity: someCompany1 },
  { action: 'Put', type: 'employee', entity: someEmployee1 },
  {
    action: 'Update',
    type: 'employee',
    entity: someEmployee2,
    updateExpression: 'SET firstName = :newName',
    expressionAttributeValues: { ':newName': 'Charlie' }
  },
  { action: 'Delete', type: 'company', entity: someCompany2 }
]);
```

### Querying an index

DynamoDB tables can have multiple indices. Here is an example on how to specify
and use an index in DynaBridge:
```typescript
import { DynaBridge, DynaBridgeEntity } from 'dynabridge';

interface Employee {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  country: string;
}

const employeeEntity: DynaBridgeEntity<Employee, 'byCountry'> = {
  tableName: 'employee',
  id: ['companyId', 'employeeNumber'],
  index: {
    byCountry: {
      indexName: 'employee-country',
      hashKey: 'country'
    }
  }
};

export const db = new DynaBridge({
  employee: employeeEntity
});

const employeesFromGermany: Employee[] = await db.entities.employee.queryIndex('byCountry', 'Germany');
```

## Schema migrations

One major pain point with DynamoDB and with NoSQL in general is schema versioning and migration. 

An `Employee` entity is written to the table today. A few days later, new feature requirements mandate that 
employees must have a mandatory `role` field. To accommodate this, the `Employee` type and the application are 
updated accordingly. However, when loading an existing employee record written before this change, the role field 
will be missing. Attempting to access this field without proper handling can lead to unexpected behavior, 
such as application crashes, inconsistent data processing or inaccurate presentation.

In relational databases, schema migrations are often used to handle such changes - there are plenty of solutions and
tools (Liquibase, Flyway). They will make sure to migrate all the data, which ensures
that all entities adhere to the latest schema. With NoSQL, by design, schema migrations are hard. 

## On-the-fly migrations

DynaBridge addresses this challenge by applying on-the-fly migrations. 

When entities are written to the database, they are stored with their current version (starting at 1). 
When reading these entities, DynaBridge compares them to the latest schema 
version and, if necessary, applies the corresponding migration functions. This ensures that the application always works with 
entities that conform to the current schema, maintaining consistency and preventing the issues mentioned above.
When a migrated entity is saved back to the database, its version is updated to the latest version. 
This guarantees that changes to the entity are properly stored and ensures that migration functions will not need to be
applied again when the entity is loaded at a later time.

On-the-fly migrations are simple, resource-efficient, and ideal when there are no downstream processes that depend 
on the database always containing the latest schema.

### Example

**Current item in DynamoDB table `employee`**
```json
{ "companyId": "c1", "employeeNumber": 1, "firstName": "John", "lastName": "Doe", "_version": 1, "_updated_at": "..." }
```

**Updated Employee type**

```typescript
// src/domain/types.ts
type EmployeeRole = 'Manager' | 'Sales' | 'Developer' | 'HR' | 'Other';

export interface Employee {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  role: EmployeeRole;
}
```

**Updated DynaBridge Employee entity**

```typescript
// src/repository/index.ts
import { DynaBridgeEntity } from 'dynabridge';
import { Employee } from '../domain/types';

/* It is recommended to keep a "hard" copy of the schema versions for type-safety. 
   One could possibly use things like intersection types, Omit or Partial, but this
   will not always work and makes reasoning about the different schemas harder. */
interface EmployeeV1 {
  companyId: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
}

export const employeeEntity: DynaBridgeEntity<Employee> = {
  tableName: 'employee',
  id: ['companyId', 'employeeNumber'],
  migrations: [
    (v1: EmployeeV1) => ({ ...v1, role: 'Other' })
  ]
}
```

When fetching the item using the `.findById`, `.findByIds`, `.query`, `.queryIndex` or `.findAll` API, the result would be
```typescript
const employee: Employee | undefined = await db.entities.employee.findById(['c1', 1]);
console.log(employee) // { companyId: "c1", employeeNumber: 1, firstName: "John", lastName: "Doe", role: "Other" }
```

Saving the entity using the `.save`, `.saveBatch` or `.transaction` will overwrite the existing item in the table with the updated version
```typescript
await db.entities.employee.save(employee!);
```

**Updated item in DynamoDB table `employee`**
```json
{ "companyId": "c1", "employeeNumber": 1, "firstName": "John", "lastName": "Doe", "role": "Other", "_version": 2, "_updated_at": "..." }
```

## Serialization / Deserialization

All entities are written as an `Item` using the `DynamoDBClient` and `DynamoDBDocumentClient`
(depending on the operation). Sometimes, it is necessary to map the entity before
writing it into DynamoDB and when loading it from the table, e.g. when handling
Date or other complex types. DynaBridge provides a bare-bone serialize/deserialize 
feature. 

```typescript
import { DynaBridge, DynaBridgeEntity } from 'dynabridge';
import { mapDatesToString, mapStringsToDate } from './dateUtil';

const db = new DynaBridge(
  {
    employee: employeeEntity
  },
  {
    serialize: (entity) => mapDatesToString(entity),
    deserialize: (entity) => mapStringsToDate(entity)
  }
);
```

## DynaBridge API details

DynaBridge API is using the following DynamoDB API / SDK commands

* `.save`
  * Uses `DynamoDBDocumentClient` and `PutCommand`
* `.saveBatch`
  * Uses `DynamoDBDocumentClient` and `BatchWriteCommand`
  * `UnprocessedItems` retries  = 3
  * batch_size = 100
* `.findById`
  * Uses `DynamoDBClient` and `GetItemCommand` 
* `.findByIds`: 
  * Uses `DynamoDBClient`, and `BatchGetItemCommandInput`
  * `UnprocessedKeys` retries  = 3
  * batch_size = 100
  * All requested items will be returned (no pagination)
* `.query`:
  * Uses `DynamoDBDocumentClient` and `QueryCommand`
  * All requested items will be returned (no pagination)
* `.queryIndex`:
  * Uses `DynamoDBDocumentClient` and `QueryCommand`
  * All requested items will be returned (no pagination)
* `.findAll`: 
  * Uses `DynamoDBDocumentClient` and `ScanCommand`
  * sequentiell (`TotalSegments` = 1)
  * All requested items will be returned (no pagination)
* `.delete` and `.deleteById`
  * Uses `DynamoDBClient` and `DeleteItemCommand` 
* `.deleteBatch` and `.deleteByIds`
  * Uses `DynamoDBClient` and `DeleteItemCommand` 
  * `UnprocessedItems` retries  = 3
  * batch_size = 100
* `.transaction`
  * Uses `DynamoDBDocumentClient` and `TransactWriteCommand`
