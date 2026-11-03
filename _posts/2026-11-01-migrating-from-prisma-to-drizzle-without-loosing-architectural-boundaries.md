---
title: "Migrating from Prisma to Drizzle Without Losing Architectural Boundaries"
date: 2026-11-01 06:00:00 +0100
description: "Explore the architectural considerations involved in migrating a TypeScript backend from Prisma to Drizzle while preserving repository contracts and application boundaries."
categories:
  - Backend Engineering
  - Architecture
tags:
  - typescript
  - nodejs
  - nestjs
  - prisma
  - drizzle
  - postgresql
  - clean-architecture
---

Changing an ORM in an existing backend is not simply a matter of replacing one database client with another.

It is an architectural exercise.

I have been working through a migration from Prisma to Drizzle in a NestJS and PostgreSQL application. One of the things this work has reinforced for me is that database technology should not become the centre of the application's business logic.

An ORM is an infrastructure choice. It should help the application communicate with the database, but it should not determine how the business operates.

## Why migrate an ORM?

Different ORMs make different trade-offs.

Prisma provides a schema-driven development experience, generated types, and a high-level query API. Drizzle takes a more SQL-oriented approach, with explicit schema definitions and queries that remain relatively close to SQL.

Neither approach is automatically better for every application.

The decision to change should come from the requirements of the system, the team's preferences, the complexity of its queries, and the level of control needed over database operations.

For me, the important consideration is not whether one ORM is more popular than another.

It is whether the persistence layer gives the application the control, clarity, and maintainability it needs.

Drizzle's [documentation](https://orm.drizzle.team/docs/overview) describes its TypeScript-first approach and SQL-like query API.

## The migration should not start in the business layer

Consider an application service that performs a business operation.

A poor migration approach would allow the application service to move directly from Prisma calls to Drizzle calls.

For example:

```ts
// Application service coupled to Prisma
const user = await prisma.user.findUnique({
  where: { id: userId },
});
```

After migration:

```ts
// Application service now coupled to Drizzle
const user = await db.query.users.findFirst({
  where: eq(users.id, userId),
});
```

The database client has changed, but the architectural problem remains.

The application service still knows how data is retrieved.

If the application already has repository boundaries, those boundaries should remain the point of interaction.

```ts
export interface UserRepository {
  findById(id: string): Promise<User | null>;
}
```

The application layer depends on the contract. The infrastructure layer implements it.

```text
Application Service
        │
        ▼
 UserRepository
        │
        ▼
Drizzle Repository
        │
        ▼
   PostgreSQL
```

This is the dependency direction I want to preserve.

The [Dependency Inversion Principle](https://martinfowler.com/articles/dipInTheWild.html) is useful here: high-level application policy should not depend directly on low-level infrastructure details.

## Preserve the meaning of repository methods

A repository should express what the application needs, not expose every capability of the ORM.

For example:

```ts
interface UserRepository {
  findById(id: string): Promise<User | null>;

  findByEmail(email: string): Promise<User | null>;

  update(id: string, input: UpdateUserInput): Promise<User>;
}
```

The implementation can use Prisma, Drizzle, or another persistence technology.

The application should not need to know.

However, this does not mean every repository must have a generic interface or that all database queries should be hidden behind elaborate abstractions.

The contract should be driven by the actual use cases.

If a use case needs to retrieve a user with their role, permissions, identity, office, and department, the repository should expose a method that expresses that requirement clearly.

It should not force the application service to reconstruct the relationship by making several unrelated database calls.

## Database schema is part of the migration

A migration also requires careful attention to the database schema.

The application may have enums, foreign keys, unique constraints, indexes, check constraints, database schemas, and Row-Level Security policies.

These are not incidental ORM details.

They are part of the database contract.

For example, changing an ORM does not remove the need to preserve a unique constraint:

```sql
ALTER TABLE app.auth_sessions
ADD CONSTRAINT auth_sessions_refresh_token_hash_unique
UNIQUE (refresh_token_hash);
```

The actual migration should inspect the existing database before making schema changes. It should not recreate constraints blindly or assume that the ORM schema is the complete representation of the database.

Drizzle supports defining schemas in TypeScript, but the database remains the final authority on what constraints and objects exist.

This is particularly important where PostgreSQL features such as RLS, custom schemas, triggers, or database-specific constraints are involved.

See the [Drizzle schema documentation](https://orm.drizzle.team/docs/sql-schema-declaration) and [PostgreSQL constraints documentation](https://www.postgresql.org/docs/current/ddl-constraints.html).

## Type safety does not eliminate runtime problems

One of the advantages of using TypeScript with Drizzle is that query results can be strongly typed.

However, TypeScript types do not guarantee that the database contains the data we expect.

They also do not eliminate problems involving:

- nullability;
- database defaults;
- enum values;
- timestamp handling;
- UUID values;
- numeric conversions;
- foreign-key relationships;
- transaction behavior.

The database schema, application types, and actual query behavior must remain aligned.

A query that compiles successfully can still fail at runtime because a constraint is violated, a column is missing, a value has the wrong type, or the database role lacks permission.

This is why I treat type safety as an important development aid, not a replacement for database validation and integration testing.

## Migrate incrementally and verify behavior

A migration should be performed in manageable steps.

My preferred approach is to:

1. Understand the existing Prisma repository behavior.
2. Identify the repository contract and its consumers.
3. Define the equivalent Drizzle schema and query behavior.
4. Implement the new repository.
5. Verify relationships, constraints, and transaction behavior.
6. Run integration tests against PostgreSQL.
7. Remove the old implementation only when its replacement has been verified.

The objective is behavioral equivalence, not merely syntactic equivalence.

A new query may return the same basic record but omit a relation that the previous implementation loaded. A partial update may accidentally overwrite fields with `null` or `undefined`. A transaction may no longer preserve the same guarantees.

These are the kinds of differences that can be missed when migration is treated as a search-and-replace exercise.

## Final thought

An ORM migration should improve the persistence layer without forcing the entire application to change with it.

The repository boundary is valuable because it gives the application a stable way to access data while allowing infrastructure implementations to evolve.

Changing Prisma to Drizzle is therefore not just about learning a different query API.

It is an opportunity to examine whether the application has clear persistence boundaries, whether database behavior is properly understood, and whether business logic has become unnecessarily dependent on infrastructure.

The ORM can change.

The business rules should not have to.
