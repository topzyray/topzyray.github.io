---
title: "PostgreSQL Transactions: Why Connection Context Matters"
date: 2026-11-03 06:00:00 +0100
description: "Understand PostgreSQL transaction boundaries, pooled connections, transaction-local settings, and why related database operations must share the same connection."
categories:
  - Backend Engineering
  - Databases
tags:
  - postgresql
  - transactions
  - nodejs
  - typescript
  - connection-pooling
  - database
---

Transactions are often introduced as a way to group database operations.

We begin with a simple explanation: either all operations succeed, or none of them do.

That is correct, but production backend systems introduce another important consideration.

The operations must actually execute within the same database transaction and on the same connection.

This matters particularly when the application uses PostgreSQL connection pooling, transaction-scoped settings, and database security policies.

## What a transaction guarantees

Consider an operation that creates a business record and its associated items.

We do not want the parent record to exist if the required child records cannot be created.

A transaction gives us a way to group those changes:

```ts
await db.transaction(async (tx) => {
  const [record] = await tx.insert(records).values(recordInput).returning();

  await tx.insert(recordItems).values(
    items.map((item) => ({
      ...item,
      recordId: record.id,
    })),
  );
});
```

If an operation inside the transaction fails, the transaction can be rolled back.

If all operations complete successfully, the transaction can be committed.

This is the basis of atomicity in the ACID properties of relational databases.

PostgreSQL documents transaction behavior in its [transaction tutorial](https://www.postgresql.org/docs/current/tutorial-transactions.html).

## A transaction belongs to a database connection

A PostgreSQL transaction is associated with a database session, which is represented by a connection.

This is important because a connection pool may contain several connections.

Consider:

```text
Application
    │
    ▼
Connection Pool
    │
    ├── Connection A
    ├── Connection B
    └── Connection C
```

When an application executes a query through the pool, the pool manages which connection handles it.

If a transaction begins on Connection A, the statements belonging to that transaction must execute on Connection A.

Sending a subsequent statement independently through the pool does not guarantee that it will use the same connection.

For example, this is conceptually unsafe:

```ts
await pool.query("BEGIN");

await pool.query("INSERT INTO records (...) VALUES (...)");

await pool.query("COMMIT");
```

The pool may assign these statements to different connections.

A transaction should instead use a dedicated client or a transaction API that maintains connection affinity.

With the `pg` library, the documented approach is to acquire a client and use that client for all statements in the transaction. See [node-postgres transactions](https://node-postgres.com/features/transactions).

## Transaction-scoped settings make this more important

PostgreSQL allows applications to set configuration values for the duration of a transaction.

For example:

```sql
SELECT set_config(
  'app.user_id',
  '00000000-0000-0000-0000-000000000001',
  true
);
```

The third argument makes the setting transaction-local.

The setting is available within the current transaction and is reset when that transaction ends.

This is useful when an application needs to establish identity context for database operations.

For example, a PostgreSQL RLS policy may use the current application user or tenant identifier to decide which records can be accessed.

A simplified policy might look like:

```sql
CREATE POLICY records_user_policy
ON app.records
USING (
  user_id = current_setting(
    'app.user_id',
    true
  )::uuid
);
```

The actual policy must account for missing or invalid context and should be tested with the application's real database role.

The important point is that setting the identity context and executing the protected query must happen within the same transaction.

Otherwise, the query may execute on a connection where the expected context was never established.

## Why connection pooling can expose security problems

Connection pooling improves resource utilization by allowing an application to reuse database connections.

However, pooled connections are reused by different requests over time.

This creates a risk if request-specific state is stored at the connection level and not correctly scoped or reset.

Imagine:

```text
Request A
   │
   ▼
Connection 1
   │
   └── user_id = User A

Connection returned to pool

Request B
   │
   ▼
Connection 1
```

If the application relies on session-level state without correctly resetting it, Request B could encounter context left behind by Request A.

That is a serious problem when the setting influences row-level security or authorization.

Transaction-local settings help reduce this risk because they are scoped to the transaction.

However, the application must still ensure that the protected queries execute inside that transaction.

## A safer transaction boundary

A database service can provide a transaction wrapper that establishes the required context before application operations execute.

Conceptually:

```ts
async executeInTransaction<T>(
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return this.db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config(
        'app.user_id',
        ${userId},
        true
      )`,
    );

    return callback(tx);
  });
}
```

This is illustrative. A real implementation must obtain and validate the identity context, handle missing values according to the operation's requirements, and ensure every protected query uses `tx`.

The transaction object should be passed to repositories or made available through a carefully controlled transaction context.

The important invariant is:

```text
BEGIN
  │
  ▼
Establish Request Identity
  │
  ▼
Execute Protected Queries
  │
  ▼
COMMIT or ROLLBACK
```

The identity context and the database operations share one transaction.

## Do not accidentally escape the transaction

A common source of mistakes is calling the global database client from inside a transaction callback.

For example:

```ts
await db.transaction(async (tx) => {
  await tx.insert(records).values(input);

  // This query is not necessarily part of the transaction.
  await db.insert(recordItems).values(items);
});
```

The second operation uses `db`, not `tx`.

It may execute outside the transaction.

That means it may commit even if the first operation later rolls back.

The correct approach is to use the transaction-scoped client consistently:

```ts
await db.transaction(async (tx) => {
  await tx.insert(records).values(input);
  await tx.insert(recordItems).values(items);
});
```

This is one reason transaction boundaries should be explicit in the data-access design.

## Transactions should not be unnecessarily long

Transactions are useful, but they are not free.

Long-running transactions can hold locks, delay cleanup, increase contention, and consume connections that other requests need.

I try to keep external operations outside database transactions.

For example, an application should generally avoid holding a database transaction open while waiting for an external HTTP API or sending an email.

A better design is to complete the required database operation, record the intent to perform asynchronous work when necessary, and let a separate process handle the external operation.

The transactional outbox pattern is one approach when a database change and an event publication must be coordinated reliably.

## Final thought

Understanding transactions requires more than knowing how to call `transaction()`.

We need to understand the connection executing the statements, the lifetime of the transaction, the behavior of pooled connections, and the scope of any database context established during the operation.

This becomes especially important when PostgreSQL Row-Level Security depends on transaction-local identity settings.

A transaction is not simply a collection of queries written between two method calls.

It is a database execution boundary with specific connection and consistency guarantees.

Getting that boundary right is part of building a secure and reliable backend.
