---
title: "An ORM Is Not Your Data Architecture"
date: 2026-11-02 06:00:00 +0100
description: "Understand why database access patterns, repository responsibilities, and application boundaries matter more than the ORM chosen for a backend."
categories:
  - Backend Engineering
  - Architecture
tags:
  - typescript
  - nodejs
  - orm
  - repository-pattern
  - clean-architecture
  - database-design
---

It is easy to confuse the choice of an ORM with the design of a backend's data layer.

An application can use Prisma, Drizzle, TypeORM, Sequelize, or direct SQL and still have a poorly structured persistence layer.

The ORM determines how the application communicates with the database. It does not automatically determine where data-access responsibilities belong, how business rules are enforced, or how application services should interact with persistence.

This distinction has become particularly relevant while working through my current database-layer migration.

## The ORM solves a specific problem

An ORM or database toolkit helps developers interact with relational data.

Depending on the tool, it may provide:

- schema definitions;
- query construction;
- relationship loading;
- type inference;
- migrations;
- transaction APIs;
- connection management.

These capabilities are useful.

However, they do not automatically give an application a good architecture.

For example, consider this service:

```ts
@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}

  async findUser(userId: string) {
    return this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        role: true,
        identity: true,
      },
    });
  }
}
```

This code may work correctly.

But the service now knows the database query API, the schema representation, and the relationship-loading strategy.

If the same pattern spreads across application services, the ORM becomes part of the application architecture.

That makes future changes more expensive.

## Separate application needs from persistence implementation

A use case should describe what the application needs to accomplish.

For example:

```ts
export class GetUserProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string) {
    return this.users.findProfileById(userId);
  }
}
```

The repository contract can be defined independently:

```ts
export interface UserRepository {
  findProfileById(userId: string): Promise<UserProfile | null>;
}
```

The infrastructure implementation decides how the profile is retrieved.

```text
GetUserProfile
      │
      ▼
UserRepository
      │
      ▼
DrizzleUserRepository
      │
      ▼
 PostgreSQL
```

The use case does not need to know whether the implementation uses joins, relational queries, or multiple database operations.

It depends on the result it needs.

This is one practical application of dependency inversion and the separation of concerns described in [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html).

## Repository methods should reflect use cases

A common mistake is creating a repository with only generic methods:

```ts
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

This looks reusable, but it may not express what a real application needs.

Consider a user-management workflow.

The application may need:

- a user with role and permissions;
- a user with identity information;
- users belonging to a particular office;
- users eligible for a specific operation;
- a user with active authentication sessions.

These are different data requirements.

A repository method such as `findProfileById()` or `findUserWithAuthorizationContext()` can express the intended result more clearly than forcing every use case to combine generic queries.

This does not mean repositories should become collections of arbitrary business operations. The domain and application layers still own business decisions.

The repository is responsible for retrieving and persisting the data needed by those decisions.

## Avoid moving business rules into repositories

There is another side to this problem.

Repositories should not become the place where all business logic is hidden.

For example:

```ts
async approveRequisition(id: string) {
  // Load requisition.
  // Check approval authority.
  // Evaluate business rules.
  // Change status.
  // Create audit record.
  // Persist everything.
}
```

This method may be doing far more than data access.

Approval authority, valid state transitions, and business rules belong in the appropriate domain or application services. The repository should provide the persistence operations required to carry out the use case.

The distinction is not always a matter of one universal folder structure. It is about ensuring that each responsibility has a clear owner.

## Do not abstract every query unnecessarily

There is also a danger of overengineering the data layer.

Not every query needs a large repository hierarchy or a generic data-access framework.

A small application may be perfectly maintainable with a straightforward database service and a few well-defined modules.

An abstraction is useful when it protects a meaningful boundary or simplifies a recurring responsibility.

It is less useful when it only adds layers without reducing coupling or improving clarity.

I prefer to ask:

> Does this abstraction make the application's responsibilities clearer, or does it simply move the same complexity into another file?

That question helps avoid introducing interfaces and factories that have no meaningful purpose.

## The persistence layer still needs to understand SQL

Using an ORM does not remove the need to understand relational databases.

Developers still need to understand:

- joins;
- indexes;
- unique constraints;
- foreign keys;
- transactions;
- isolation levels;
- query plans;
- locking;
- connection pooling.

A query can be type-safe and still be inefficient.

A repository can have a clean interface and still execute an N+1 query pattern.

A transaction can be correctly typed and still hold locks for too long.

This is why I do not see ORM knowledge as a substitute for database knowledge.

The ORM is a tool. SQL and relational database fundamentals remain important.

The [PostgreSQL documentation](https://www.postgresql.org/docs/current/index.html) is a useful reference for understanding the behavior underneath the abstraction.

## Final thought

A well-designed data layer is not defined by the ORM it uses.

It is defined by the clarity of its responsibilities, the correctness of its database operations, and the quality of the boundaries between application logic and infrastructure.

Prisma does not automatically create a good architecture. Drizzle does not automatically create one either.

The developer still has to decide what belongs in the application layer, what belongs in the persistence layer, and how the two should communicate.

I would rather have a simple, well-understood data layer with clear responsibilities than a sophisticated ORM setup that allows infrastructure concerns to spread throughout the application.
