<p align="center">
  <img alt="dynabridge logo" height="150px" src="./static/logo.png" />  
</p>
<h1 align="center">DynaBridge</h1>

![](https://img.shields.io/github/license/kasleet/dynabridge?style=flat)
[![](https://img.shields.io/github/actions/workflow/status/kasleet/dynabridge/ci.yaml?style=flat)](https://github.com/kasleet/dynabridge/actions/workflows/ci.yaml)
[![](https://img.shields.io/npm/v/dynabridge?style=flat)](https://www.npmjs.com/package/dynabridge)

Simple and light-weight TypeScript ORM mapper for AWS DynamoDB

## Who is this intended for?

You have a full stack web application or some other Node server written in TypeScript, and you’re kind of 
abusing DynamoDB as your relational database? Are you storing your entities in multiple tables, even though 
Alex DeBrie has told you [over](https://www.youtube.com/watch?v=BnDKD_Zv0og&t=787s) and 
[over](https://www.youtube.com/watch?v=PVUofrFiS_A) and 
[over again](https://www.youtube.com/watch?v=hjqrDqVaiw0) not do it?

After attending multiple re:Invents, watching every YouTube video on Single Table Design, 
and surviving a two-week bootcamp on how to properly overload Global Secondary Indexes, 
you might finally be able to implement a simple to-do application using DynamoDB. 
But the moment you need to add a feature with a new access pattern or explain it all to a colleague, 
it feels like you’re on the verge of a nervous breakdown.

In the end, most of us know that DynamoDB is just not the right tool for our use case (especially 
when requirements and access patterns change) but its just 
so simple and dirt cheap - especially when building a serverless application using Lambda.

This library is here to ease the pain of abusing DynamoDB as a relational database. It won’t make it _right_, 
but it might make it a bit less painful by bridging the gap.

## What's the difference to other DynamoDB ORMs?

There are plenty of other ORMs and wrappers for DynamoDB out there.
Many of them seem abandoned, lack traction, or just feel overly complex. 
The goal of this library is to keep things as simple as possible, with a minimal footprint, 
while still providing all the essential features you need for your CRUD operations.

## Key features and selling points

* No use of decorators - keeping your types and interfaces clean
* Extremely easy to use
* CRUD for your data model
* On-the-fly migrations

## Examples

// TODO

