<p align="center">
  <img alt="dynabridge logo" height="150px" src="./static/logo.png" />  
</p>
<h1 align="center">DynaBridge</h1>

![](https://img.shields.io/github/license/kasleet/dynabridge?style=flat)
[![](https://img.shields.io/github/actions/workflow/status/kasleet/dynabridge/ci.yaml?style=flat)](https://github.com/kasleet/dynabridge/actions/workflows/ci.yaml)
[![](https://img.shields.io/npm/v/dynabridge?style=flat)](https://www.npmjs.com/package/dynabridge)

Simple and light-weight TypeScript entity-focused wrapper for DynamoDB

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

This library is here to ease the pain of abusing DynamoDB as a relational database. It won’t make it _right_,
but it might make it a bit less painful by bridging the gap.

## What's the difference to other DynamoDB wrappers or ORMs?

There are plenty of other ORMs and wrappers for DynamoDB out there.
Many of them seem abandoned, lack traction, or just feel overly complex.
The goal of this library is to keep things as simple as possible, with a minimal footprint,
while still providing all the essential features you need for your CRUD operations.

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
import { DynaBridgeEntity } from 'dynabridge';
import { Company, Employee } from '../domain/types.ts';

const companyEntity: DynaBridgeEntity<Company> = {
  tableName: 'company-table-739ab4',
  id: 'id'
};

const employeeEntity: DynaBridgeEntity<Employee> = {
  tableName: 'employee-table-abf382',
  id: ['companyId', 'employeeNumber']
};

export const dbClient = new DynaBridge({
  company: companyEntity,
  employee: employeeEntity
});
```

**Note**: The ID of `Company` is `id`, this means that the DynamoDB table needs to be configured
with a hash key with name `id` of type `string`. On the other hand, an `Employee` is
identified by the combination of the `companyId` and its `employeeNumber`, therefore its
DynamoDB table needs to have a hash key (`companyId` of type string) and a
range key (`employeeNumber`, type `number`). Setting up and deploying the DynamoDB tables
are outside DynaBridge scope and preferably done using some IaC tool.

### Using the client in your application code

```typescript
// ./src/index.ts
import { dbClient } from './repository';

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

#### Write single entity

```typescript
await dbClient.entities.company.save(someCompany1);
await dbClient.entities.employee.save(someEmployee1);
```

#### Write multiple entities

```typescript
await dbClient.entities.company.saveBatch([someCompany1, someCompany2]);
await dbClient.entities.employee.saveBatch([someEmployee1, someEmployee2]);
```

#### Fetch entity by id

```typescript
const company: Company = await dbClient.entities.company.findById('c1');
const employee: Employee = await dbClient.entities.company.findById(['c1', 1]);
```

#### Fetch multiple entities by id

```typescript
const companies: Company[] = await dbClient.entities.company.findByIds(['c1', 'c2']);
const employees: Employee[] = await dbClient.entities.employee.findByIds([['c1', 1], ['c1', 2]]);
```

#### Fetch all entities

```typescript
const companies: Company[] = await dbClient.entities.company.findAll();
const employees: Employee[] = await dbClient.entities.employee.findAll();
```

#### Delete entity

```typescript
await dbClient.entities.company.delete(someCompany1);
await dbClient.entities.employee.delete(someEmployee1);
```

#### Delete multiple entities

```typescript
await dbClient.entities.company.deleteBatch([someCompany1, someCompany2]);
await dbClient.entities.employee.deleteBatch([someEmployee1, someEmployee2]);
```

#### Delete entity by id

```typescript
await dbClient.entities.company.deleteById('c1');
await dbClient.entities.employee.deleteById(['c1', 1]);
```

#### Delete multiple entities by id

```typescript
await dbClient.entities.company.deleteByIds(['c1', 'c2']);
await dbClient.entities.employee.deleteByIds([['c1', 1], ['c1', 2]]);
```

#### Transaction

```typescript
await dbClient.transaction([
  { action: 'Put', type: 'company', entity: someCompany1 },
  { action: 'Put', type: 'employee', entity: someEmployee1 },
  {
    action: 'Update',
    type: 'employee',
    entity: someEmployee2,
    updateExpression: 'SET #firstName = :newName',
    expressionAttributeValues: { ':newName': 'Charlie' }
  },
  { action: 'Delete', type: 'company', entity: someCompany2 }
]);
```
