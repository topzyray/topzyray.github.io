---
title: "Debugging Database Migrations Without Guessing"
date: 2026-11-10 06:00:00 +0100
description: "Develop a systematic approach to debugging ORM and database migration failures by inspecting SQL, schema definitions, runtime values, constraints, and transaction behavior."
categories:
  - Backend Engineering
  - Developer Experience
tags:
  - debugging
  - typescript
  - nodejs
  - drizzle
  - prisma
  - postgresql
  - database-migrations
---

Database migration errors can be frustrating, particularly when an application has several layers between the code that initiates an operation and the SQL that eventually reaches PostgreSQL.

A repository may appear correct. TypeScript may compile. The application may start successfully. Yet an insert or update can still fail at runtime.

I have been working through this kind of debugging while migrating an existing persistence layer from Prisma to Drizzle.

One thing I keep reminding myself is that debugging should begin with evidence, not assumptions.

## Compilation does not guarantee database correctness

TypeScript provides useful compile-time checks.

An ORM can also infer types from a schema definition and help prevent many invalid queries.

But the database has its own rules.

It enforces:

- column types;
- nullability;
- unique constraints;
- foreign keys;
- check constraints;
- permissions;
- triggers;
- transaction behavior.

A query that compiles may still violate one of these rules.

The application may also have a mismatch between its TypeScript schema definition and the actual database schema.

This is why I do not treat a successful build as proof that a database migration is correct.

## Start with the actual error

When a database operation fails, the first step should be to inspect the complete error.

For a Drizzle query, the underlying error may be wrapped in a `DrizzleQueryError`.

The useful information may include:

- the generated SQL;
- the parameters supplied;
- the underlying PostgreSQL error;
- the PostgreSQL error code;
- the constraint name;
- the table or column involved.

Do not stop at the top-level message if the original database error is available.

For example, PostgreSQL error codes can help identify the category of a failure.

Some useful examples include:

| SQLSTATE | Meaning                     |
| -------- | --------------------------- |
| `23502`  | Not-null violation          |
| `23503`  | Foreign-key violation       |
| `23505`  | Unique violation            |
| `23514`  | Check-constraint violation  |
| `22P02`  | Invalid text representation |

PostgreSQL maintains a complete list in its [error-code documentation](https://www.postgresql.org/docs/current/errcodes-appendix.html).

The error code is often more useful than trying random changes to the query.

## Inspect the generated SQL

An ORM query is ultimately translated into SQL.

When debugging, inspect that SQL.

For example, an application may execute:

```ts
await db.insert(authSessions).values({
  userId,
  refreshTokenHash,
  clientType,
  expiresAt,
});
```

The generated SQL and parameter list can help answer questions such as:

- Is the correct table being targeted?
- Are the column names correct?
- Is a required field missing?
- Are values being mapped to the expected columns?
- Is the query using the intended schema?
- Is the ORM supplying a default where expected?

This is particularly important when working with custom PostgreSQL schemas such as `app` and `audit`.

A table with the same name in a different schema is not necessarily the same database object.

## Compare the TypeScript schema with the real database

During ORM migration, it is possible for the TypeScript schema to describe something different from what exists in PostgreSQL.

For example:

```ts
export const authSessions = app.table("auth_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  refreshTokenHash: text("refresh_token_hash").notNull(),
});
```

This is only an illustrative fragment.

The actual database may contain additional columns, defaults, unique constraints, indexes, or checks.

The migration process should compare the ORM definition against the real database schema.

Useful inspection commands include:

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'app'
  AND table_name = 'auth_sessions'
ORDER BY ordinal_position;
```

To inspect constraints:

```sql
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'app'
  AND table_name = 'auth_sessions';
```

These queries provide a starting point. More detailed inspection may be required for indexes, expressions, foreign-key definitions, policies, and other database objects.

The objective is to compare what the application believes exists with what PostgreSQL actually has.

## Inspect the values, not only the SQL

Sometimes the SQL is correct but the values are not.

A UUID column may receive an invalid string. A required field may be `undefined`. A timestamp may be incorrectly converted. An enum may contain a value that the database does not accept.

For example:

```ts
console.log({
  userId,
  clientType,
  expiresAt,
});
```

Logging can help, but it must be done carefully.

Do not log raw refresh tokens, passwords, access tokens, authentication secrets, or unnecessary personal information.

For sensitive operations, inspect safe metadata such as whether a value is present, its type, or a sanitized representation.

A useful debugging process should reveal the problem without introducing another security problem.

## Understand the difference between undefined and null

This distinction is especially important when building insert and update objects dynamically.

Consider:

```ts
const input = {
  firstName: "Tope",
  phone: undefined,
  departmentId: null,
};
```

These values may have different meanings.

`undefined` often means the property was not supplied.

`null` may mean the caller explicitly wants the database column to contain no value.

A repository that treats both values identically can accidentally clear data or omit a required value.

This is why partial-update helpers and insert mappers should have explicit semantics.

## Check the transaction boundary

A query can also fail because it is being executed in the wrong transaction context.

This is particularly important when the application uses transaction-local PostgreSQL settings or Row-Level Security.

For example, the application may establish:

```sql
SELECT set_config(
  'app.user_id',
  $1,
  true
);
```

Then execute a protected query.

If the protected query is executed through a different database client or connection, it may not inherit the transaction-local setting.

The same issue can affect writes that are expected to participate in one atomic transaction.

When debugging, verify:

- where the transaction begins;
- which transaction client executes each query;
- whether the global database client is used accidentally inside a transaction;
- whether the transaction is committed or rolled back;
- whether the required context is established before protected queries.

The database error may be a symptom of a transaction-boundary problem rather than a problem with the insert statement itself.

## Check constraints and relationships

A failed insert may be caused by a constraint that is doing exactly what it was designed to do.

For example, a foreign-key violation may indicate that the referenced user or department does not exist.

A unique violation may indicate that a record already exists.

A check-constraint violation may indicate that a value falls outside the permitted range.

The correct response is not necessarily to remove the constraint.

First determine whether the application is supplying invalid data or whether the constraint no longer reflects the intended business rule.

Constraints protect the database from inconsistent state. Removing them simply to make an insert succeed can create a larger problem.

## Reproduce the smallest failing operation

When a complex workflow fails, reduce the problem to the smallest operation that still reproduces it.

For example:

1. Identify the repository method that fails.
2. Inspect its input.
3. Inspect the generated SQL.
4. Run an equivalent query against a safe development database.
5. Check the relevant schema and constraints.
6. Verify the transaction context.
7. Change one thing at a time.
8. Add a regression test after the cause is established.

This is more reliable than changing several schema fields, query options, and transaction settings simultaneously.

If the error disappears after several unrelated changes, it may be difficult to know which change actually resolved it.

A minimal reproduction helps isolate the cause.

## Add tests for the failure you fixed

Once the cause is understood, add a test that protects against the same problem returning.

Depending on the failure, this may be:

- a repository integration test;
- a database constraint test;
- a transaction test;
- an RLS policy test;
- a schema migration test;
- a test for null and undefined handling.

The test should verify the expected behavior, not merely confirm that the code no longer throws the same error.

For database-specific behavior, integration tests against PostgreSQL are often necessary. A mocked repository cannot prove that PostgreSQL will enforce a constraint or apply an RLS policy as expected.

## Final thought

Debugging database failures is easier when we stop guessing and follow the evidence.

Inspect the underlying error, generated SQL, parameter values, database schema, constraints, and transaction boundary.

An ORM can make database development more productive, but it does not remove the need to understand what PostgreSQL is actually executing.

This is particularly important during an ORM migration, where the application may compile successfully while its persistence behavior has changed.

The objective is not simply to make the error disappear.

It is to understand why it happened, correct the underlying problem, and add enough verification to prevent the same failure from returning.
