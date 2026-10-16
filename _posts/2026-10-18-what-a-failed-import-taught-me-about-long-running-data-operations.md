---
title: "What a Failed Import Taught Me About Long-Running Data Operations"
date: 2026-10-18 06:00:00 +0100
description: "Learn how batching, durable progress tracking, idempotency, and targeted retries make long-running data imports recoverable after failures."
categories:
  - Backend Engineering
  - Reliability
tags:
  - nodejs
  - prisma
  - postgresql
  - imports
  - reliability
---

When seeding initial data into a database, large data imports can be deceptively simple.

The first implementation often looks like:

```text
Read records
   ↓
Insert records
   ↓
Done
```

That model changes when an operation involves thousands of records and a network failure occurs.

The challenge is no longer just inserting data. It is ensuring that the operation can recover safely when something interrupts its progress.

## The problem with treating an import as one operation

If an import processes thousands of records inside one enormous transaction, a failure can make recovery difficult. The transaction may hold locks for too long, consume substantial database resources, or exceed configured timeouts.

If it processes records individually, performance may suffer because of repeated database round trips and transaction overhead.

A practical approach is batching.

```text
Records
 │
 ├── Batch 1
 ├── Batch 2
 ├── Batch 3
 ├── ...
 └── Batch N
```

Instead of treating the entire dataset as one indivisible operation, the system processes manageable groups of records.

Each batch can be validated, written, and committed independently, depending on the consistency requirements of the import.

Batch size matters. Smaller batches generally reduce transaction duration and the amount of work that must be retried, but they can increase the number of database round trips. Larger batches may improve throughput, but they can consume more memory and take longer to process.

The right batch size depends on the database, record complexity, constraints, indexes, available resources, and acceptable recovery cost.

## Batching creates a recovery point

Suppose:

```text
Batch 1  → committed
Batch 2  → committed
...
Batch 47 → committed
Batch 48 → failed
```

We should not necessarily restart from the beginning.

If the earlier batches have been committed successfully, the system should be able to identify that progress and resume from the appropriate point.

However, batching alone does not guarantee resumability.

The application needs a reliable way to determine which records or batches have completed. A counter held only in application memory is insufficient because the process may restart and lose that information.

Depending on the import, progress can be tracked through:

- A durable checkpoint recording the last successfully processed batch.
- An import-job record containing the current status and progress.
- Stable source identifiers that allow the application to reconcile existing records.
- A combination of checkpoints and database state.

The checkpoint must accurately reflect committed work. If the system records a batch as complete before its database transaction commits, a failure could cause records to be skipped during recovery.

Conversely, if the database commits but the process crashes before updating the checkpoint, the batch may run again. That is why safe retries and idempotency remain important even when checkpoints are available.

## The real problem is resumability

A long-running operation should answer:

- What has completed?
- What failed?
- Where did the failure occur?
- Can the operation safely resume?
- Are records idempotent?
- Can a partially completed batch be retried?
- Can the system distinguish a failed operation from one that is still running?

These questions are more important than simply making the initial import work.

For a production import, I would also want to know the total number of records, how many have succeeded or failed, when the operation last made progress, and whether the failure is transient or requires intervention.

That information makes the operation observable and gives an operator a way to understand its state without reconstructing everything from application logs.

A useful design is to represent the import as a durable job with explicit states, such as:

```text
PENDING
   ↓
RUNNING
   ├──→ COMPLETED
   ├──→ FAILED
   └──→ PAUSED / RETRYABLE
```

The exact states depend on the requirements. What matters is that the system can explain its current state and recover from interruption without relying on assumptions about what happened before the failure.

## Network failure is normal

During one of the data-import workflows I worked through, a network connectivity failure occurred after many records had already been committed.

The useful lesson was not the specific error.

It was the architecture of the recovery problem.

A network failure does not necessarily tell us whether the database operation failed. In some situations, the client loses its connection after the database has committed a transaction but before the client receives confirmation.

The application may therefore be uncertain about the outcome.

Blindly repeating the operation can create duplicates or violate constraints. Assuming success can leave records missing.

This is why recovery logic should rely on durable database state, stable record identities, and safe retry behavior rather than treating every connection error as proof that nothing was committed.

A long-running operation must be designed with interruption in mind.

## Idempotency

If we retry a batch, we should avoid creating duplicates or corrupting existing data.

That means the import needs a stable identity for each record or another mechanism for safely determining whether the record has already been processed.

For example, an imported personnel record might have a unique service number, while an organizational record might have a stable directory code. These identifiers can help the application reconcile incoming data with existing records.

In PostgreSQL, unique constraints provide an important database-level safeguard. Depending on the intended behavior, the import can use an insert, an upsert, or an explicit reconciliation step.

However, idempotency is not simply a matter of ignoring duplicate-key errors. The system must define what should happen when an existing record is encountered:

- Should the existing record remain unchanged?
- Should selected fields be updated?
- Should conflicting values cause the import to fail?
- Should the conflict be recorded for manual review?

The answer depends on whether the import is intended to create new records, synchronize an external source, or update an existing dataset.

The application and database should enforce the chosen behavior consistently.

## Retrying the right unit of work

Another important consideration is deciding what to retry.

If a batch fails, retrying the entire import may waste time and repeat completed work. Retrying only the failed batch is often more efficient, provided the batch can be executed safely more than once.

A practical retry strategy should distinguish transient failures, such as temporary network interruptions or database unavailability, from permanent failures, such as invalid data or violated business rules.

Transient failures may justify a limited number of retries with exponential backoff and jitter. Permanent failures usually require correction rather than repeated execution.

For partially processed batches, the design must also establish the unit of atomicity. If each batch is committed as one transaction, a failed transaction should roll back its database changes. If records are committed individually, the retry mechanism must account for the records that succeeded before the failure.

This distinction affects how checkpoints are recorded and how much work recovery may need to repeat.

## Final thought

A production data import is not just an insertion script.

It is a recoverable workflow.

Batching helps control the amount of work performed at once. Durable progress tracking makes recovery possible. Idempotency makes retries safer. Observability makes failures understandable.

Once operations become long-running, failure and resumption need to be considered part of the design rather than exceptional afterthoughts.
