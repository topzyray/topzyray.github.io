---
title: "Database Constraints Are Part of Application Design"
date: 2026-11-08 06:00:00 +0100
description: "Understand why database constraints are essential to data integrity and how foreign keys, unique constraints, check constraints, and transactions complement application validation."
categories:
  - Backend Engineering
  - Databases
tags:
  - postgresql
  - database-design
  - data-integrity
  - constraints
  - typescript
  - nodejs
---

Application validation is important.

We validate incoming requests, check business rules, verify permissions, and ensure that users provide acceptable data.

But I do not think application validation should be the only thing protecting the integrity of a relational database.

The database should also enforce the rules it is responsible for maintaining.

This is one of the principles I keep in mind when working with relational schemas and migrating persistence implementations.

## Application validation is not enough

Consider an application that prevents duplicate email addresses.

A service might perform this check:

```ts
const existingUser = await users.findByEmail(email);

if (existingUser) {
  throw new ConflictException("Email already exists");
}

await users.create(input);
```

This is useful because it allows the application to return a meaningful error.

However, two requests can arrive at almost the same time.

```text
Request A checks email → Available
Request B checks email → Available

Request A inserts user
Request B inserts user
```

Without a database constraint, both requests may successfully create records with the same email address.

The application check does not guarantee uniqueness under concurrency.

A database unique constraint does.

```sql
ALTER TABLE app.users
ADD CONSTRAINT users_email_unique
UNIQUE (email);
```

The application can still check first for a better user experience, but the database constraint is the final guarantee.

PostgreSQL documents unique constraints in its [constraints documentation](https://www.postgresql.org/docs/current/ddl-constraints.html).

## Constraints protect invariants

A database constraint expresses a condition that must remain true for stored data.

Some common examples include:

- a user's email address must be unique;
- a child record must reference an existing parent;
- a quantity must not be negative;
- a required field must not be null;
- a relationship must not cross an organizational boundary.

These rules should not depend entirely on every application service remembering to implement them.

The database can enforce many of them directly.

## Foreign keys preserve relationships

Consider a system with users and departments.

A user may belong to a department, and the department must exist.

A foreign key can enforce this relationship:

```sql
ALTER TABLE app.users
ADD CONSTRAINT users_department_fk
FOREIGN KEY (department_id)
REFERENCES app.departments(id);
```

This prevents the database from accepting a user record that references a department that does not exist.

Foreign keys are particularly important when multiple application workflows create or modify related records.

They help ensure that one part of the application cannot accidentally create an invalid relationship.

In a multi-tenant system, a simple foreign key may not be sufficient to enforce tenant ownership. Composite keys or additional constraints may be needed to ensure that related records belong to the same tenant.

## Check constraints enforce valid values

Some rules concern the value stored in a particular column.

For example:

```sql
ALTER TABLE app.inventory_items
ADD CONSTRAINT inventory_quantity_nonnegative
CHECK (quantity >= 0);
```

This prevents negative quantities from being persisted.

A check constraint can also restrict a value to a permitted set:

```sql
ALTER TABLE app.auth_sessions
ADD CONSTRAINT auth_sessions_client_type_check
CHECK (
  client_type IN (
    'web',
    'mobile',
    'desktop'
  )
);
```

This can be useful where the database must enforce a known set of valid values.

However, check constraints should not be used as a replacement for complex business workflows.

A rule such as whether a particular user is permitted to approve a request may depend on several records, permissions, and workflow states. That is better handled by the application and, where appropriate, database-level mechanisms specifically designed for the requirement.

## NOT NULL and defaults matter too

A field that must always have a value should generally be defined as `NOT NULL`.

For example:

```sql
CREATE TABLE app.departments (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ
      NOT NULL DEFAULT NOW()
);
```

The database default ensures that a timestamp is generated when an insert does not supply one.

But a default does not make a column non-nullable. These are separate concerns.

Likewise, a default should not be used to hide missing application data when the application is expected to provide a meaningful value.

The database schema should communicate the actual data requirements.

## Constraints and ORM migrations

When using an ORM, it is easy to focus on the TypeScript schema definition and forget that the database contains the real enforcement rules.

A migration may define a model or table that looks correct while omitting an important constraint.

This is why I treat schema migration as more than generating tables.

I want to verify:

- primary keys;
- foreign keys;
- unique constraints;
- check constraints;
- nullability;
- defaults;
- indexes;
- delete and update behavior.

An ORM may provide a convenient way to define or generate migrations, but the resulting SQL still needs to be understood.

For example, a unique constraint on `email` has different implications from an ordinary index on `email`. Both may improve lookup performance, but only the unique constraint enforces uniqueness.

## Constraints do not replace transactions

A constraint protects a specific invariant.

A transaction protects a group of related changes from being partially committed.

Consider creating a requisition and its line items.

The foreign keys can ensure that the items reference an existing requisition. A check constraint may ensure that quantities are valid.

A transaction ensures that the parent and child records are committed together when the operation requires atomicity.

These mechanisms complement one another.

```text
Application Validation
        │
        ▼
Database Constraints
        │
        ▼
Transaction Boundary
        │
        ▼
Consistent Database State
```

The application communicates the business requirements. The database enforces the invariants it can guarantee. The transaction coordinates related changes.

## Constraint errors should be handled deliberately

A database constraint violation should not normally become an unexplained internal server error.

The application should recognize expected constraint failures and translate them into appropriate responses.

For example, a unique constraint violation may become a conflict response.

However, the application should not assume that every database error is a validation error.

Connection failures, permission errors, deadlocks, malformed queries, and unexpected database failures require different handling.

It is also important not to expose raw SQL statements, database credentials, or sensitive internal details in API responses.

The client needs a useful error. The engineering team needs enough structured diagnostic information to investigate it.

## Schema changes require care

Adding constraints to an existing database can be more complicated than adding them to a new table.

Existing records may violate the proposed rule.

For example, adding a unique constraint may fail if duplicate values already exist.

Adding `NOT NULL` may fail if existing rows contain null values.

The migration should therefore include an assessment of existing data, a remediation strategy, and an appropriate deployment plan.

For large tables, the operational impact of adding indexes or validating constraints also deserves attention.

Database migrations are production changes. They should be planned with the same care as application releases.

## Final thought

The application should validate data before it reaches the database, but the database should not depend entirely on the application to preserve its integrity.

Unique constraints, foreign keys, check constraints, nullability, and defaults protect important invariants even when data comes through unexpected code paths or concurrent operations.

An ORM can make schema management more convenient, but it does not remove the need to understand these database guarantees.

A good application design does not ask the database to enforce every business rule.

It does, however, make deliberate use of the rules the database can enforce reliably.
