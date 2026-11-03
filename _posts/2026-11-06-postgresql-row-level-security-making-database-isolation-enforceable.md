---
title: "PostgreSQL Row-Level Security: Making Data Isolation Enforceable"
date: 2026-11-06 06:00:00 +0100
description: "Explore PostgreSQL Row-Level Security, transaction-local identity context, policy design, and the precautions required when using pooled database connections."
categories:
  - Backend Engineering
  - Database Security
tags:
  - postgresql
  - rls
  - security
  - database
  - typescript
  - nodejs
---

Data isolation is one of the responsibilities I pay particular attention to when designing systems that manage organizational information.

It is not enough to authenticate a user and assume that every database query will automatically access only the records that user is permitted to see.

The application needs to enforce those boundaries.

PostgreSQL provides a feature called Row-Level Security (RLS) that allows access to individual rows to be controlled through database policies.

This is particularly useful when an application needs another layer of protection beyond its repository and service-level authorization checks.

## What is Row-Level Security?

Ordinary database permissions generally control access to tables, schemas, and database operations.

RLS adds another level of control.

It allows PostgreSQL to determine which rows a database role can access or modify.

For example, consider a table containing records belonging to different users:

```sql
CREATE TABLE app.documents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Without additional restrictions, a database role with permission to query the table may be able to retrieve records belonging to multiple users.

RLS allows us to define a policy that restricts the rows visible to that role.

```sql
ALTER TABLE app.documents
ENABLE ROW LEVEL SECURITY;
```

We can then define a policy:

```sql
CREATE POLICY documents_user_policy
ON app.documents
FOR SELECT
USING (
  user_id = current_setting(
    'app.user_id',
    true
  )::uuid
);
```

The policy uses the current application user identifier to determine which rows can be selected.

PostgreSQL documents this feature in its [Row Security Policies documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## The database needs a trusted context

The policy above assumes that `app.user_id` has been established correctly.

The application must set that value before executing protected queries.

For example:

```sql
SELECT set_config(
  'app.user_id',
  '00000000-0000-0000-0000-000000000001',
  true
);
```

The third argument makes the setting transaction-local.

This is important when the application uses a connection pool.

A pooled connection may be reused by different requests. Transaction-local settings help ensure that request-specific identity context does not remain active after the transaction ends.

The application should establish the context and execute the protected queries within the same transaction.

```text
Request
   │
   ▼
Authenticate User
   │
   ▼
Begin Transaction
   │
   ▼
Set Database Identity
   │
   ▼
Execute Protected Queries
   │
   ▼
Commit / Rollback
```

If the application sets the context outside the transaction or executes the protected query through a different connection, the expected policy behavior may not apply.

This is why understanding connection pooling and transaction boundaries is essential.

## RLS is not a replacement for application authorization

There is an important distinction between row-level access and business authorization.

RLS can help enforce which rows a database role may access.

It does not automatically understand every business rule in the application.

For example, a user may be allowed to read a record but not approve it.

Another user may be permitted to approve a record only when it is in a particular state and the approval falls within their assigned responsibility.

Those are business authorization decisions.

The application must still evaluate the user's permissions, the resource, the requested action, and the relevant business rules.

I see RLS as an additional enforcement boundary, not a replacement for authorization in the application layer.

## Policies must cover the operations that matter

A policy designed only for `SELECT` does not automatically define the behavior of every write operation.

PostgreSQL policies can be defined for different commands, including:

- `SELECT`;
- `INSERT`;
- `UPDATE`;
- `DELETE`;
- `ALL`.

For example, an insert policy may use `WITH CHECK` to ensure that a new row belongs to the current user:

```sql
CREATE POLICY documents_insert_policy
ON app.documents
FOR INSERT
WITH CHECK (
  user_id = current_setting(
    'app.user_id',
    true
  )::uuid
);
```

For updates, both the rows that can be targeted and the values that can be written matter.

A policy may use `USING` to determine which existing rows are visible to the operation and `WITH CHECK` to validate the resulting row.

The exact policy design depends on the data ownership model.

It is not enough to enable RLS and assume that the table is now secure.

## Database roles matter

One detail that deserves particular attention is the database role used by the application.

PostgreSQL table owners generally have special behavior with RLS. Roles with `BYPASSRLS` can bypass row-security policies, and superusers also bypass them.

The `FORCE ROW LEVEL SECURITY` option can subject table owners to policies in ordinary operations, but it does not override superuser or `BYPASSRLS` privileges.

This means an application that connects as a highly privileged database owner may not receive the protection developers expect.

The application should use a role with only the permissions it requires.

See PostgreSQL's [CREATE POLICY documentation](https://www.postgresql.org/docs/current/sql-createpolicy.html) and [ALTER TABLE documentation](https://www.postgresql.org/docs/current/sql-altertable.html).

## Missing context must fail safely

Consider a query that runs without `app.user_id` being set.

The application should not accidentally interpret missing context as unrestricted access.

The policy must be designed so that missing or invalid identity context does not expose rows.

For example, `current_setting('app.user_id', true)` returns `NULL` when the setting is unavailable. A comparison against `NULL` does not evaluate to true, which can prevent rows from being returned under a straightforward equality policy.

However, the application should still validate the context before executing protected operations. It should not rely on implicit SQL behavior as its only validation strategy.

The database policy is a final enforcement mechanism, not an excuse to pass incomplete context into the persistence layer.

## Test RLS using the real application role

A test executed as a PostgreSQL superuser may give a misleading result because superusers bypass RLS.

The same applies to other privileged roles.

Integration tests should use a role with the same relevant permissions as the application.

Useful scenarios include:

- a user can read their permitted records;
- a user cannot read another user's records;
- a user cannot insert a record under another user's identity;
- an update cannot transfer a record to an unauthorized owner;
- missing context does not expose protected rows;
- transaction-local context does not leak between pooled connections;
- the application role cannot bypass the policies.

These tests should exercise the real transaction and connection-management approach used by the application.

## RLS and organizational boundaries

The same principle can be applied to multi-tenant or organizational data.

Instead of a user identifier, a policy may use a verified tenant or organization identifier.

For example:

```sql
CREATE POLICY documents_tenant_policy
ON app.documents
FOR SELECT
USING (
  tenant_id = current_setting(
    'app.tenant_id',
    true
  )::uuid
);
```

The application must first verify that the authenticated user is authorized to operate within that tenant.

The database context should be derived from that verified relationship.

A client-supplied tenant identifier is not proof of membership.

This connects RLS to the broader architectural concerns of identity, authorization, and organizational data isolation.

## Final thought

PostgreSQL Row-Level Security provides a useful mechanism for enforcing data-access boundaries closer to the database.

But it is not a feature that should be enabled without understanding its behavior.

The application must establish trusted context, use transaction boundaries correctly, manage pooled connections carefully, and test policies using the actual application role.

RLS does not remove the need for application authorization.

It adds another layer that can help prevent a missed query filter or an unexpected data-access path from becoming a data-isolation failure.

For systems where records carry organizational or security significance, that additional enforcement can be valuable.
