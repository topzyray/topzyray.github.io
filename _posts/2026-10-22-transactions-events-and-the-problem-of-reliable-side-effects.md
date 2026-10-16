---
title: "Transactions, Events and the Problem of Reliable Side Effects"
date: 2026-10-22 06:00:00 +0100
description: "Understand the dual-write problem and how transactional outbox patterns, idempotent consumers, retries, and recovery improve event reliability."
categories:
  - Backend Engineering
  - Distributed Systems
tags:
  - transactions
  - events
  - outbox
  - postgresql
  - nodejs
  - typescript
  - messaging
  - system-design
  - data-consistency
---

A common backend operation looks simple:

```text
Update database
      +
Publish event
```

The difficulty appears when one succeeds and the other fails.

This is a problem I consider when designing backend systems that coordinate database transactions with asynchronous processing, external services, or other independently operating components.

The challenge is not simply how to save a record or publish a message.

It is how to ensure that the system remains consistent when failures occur between those operations.

## The dual-write problem

Suppose the application does:

```text
1. Save order
2. Publish OrderCreated
```

If step 1 succeeds and step 2 fails, the database contains the order but downstream systems never receive the event.

The order may exist, but the systems responsible for inventory, notifications, reporting, or other follow-up operations may never learn that it was created.

Reverse the order and another failure mode appears.

```text
1. Publish event
2. Save order
```

If the database operation fails after the event has been published, consumers may process an event for a transaction that never committed.

The problem exists because the application is trying to coordinate two independent operations without a shared atomic commit.

This is commonly known as the **dual-write problem**.

The two operations may each be reliable on their own. That does not make the combination reliable.

## Transactions do not automatically solve messaging

A database transaction can provide atomicity within the database.

For example:

```text
BEGIN
  │
  ├── Insert Order
  ├── Insert Order Items
  └── Update Inventory
  │
COMMIT
```

If an operation fails before the transaction commits, the database can roll back the changes covered by that transaction.

This is valuable because related business changes remain consistent.

However, a database transaction cannot automatically make an external message broker part of that same transaction.

Consider:

```ts
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({
    data: orderData,
  });

  await messageBus.publish({
    type: "OrderCreated",
    payload: {
      orderId: order.id,
    },
  });
});
```

At first glance, this appears to combine the database change and event publication into one operation.

It does not.

The message broker does not automatically participate in the PostgreSQL transaction.

If the message is published successfully but the database transaction later rolls back, consumers may process an event for an order that does not exist.

If the database commits but the application encounters a failure while publishing, the order may exist without the corresponding event.

Holding a database transaction open while calling an external service also increases transaction duration and can introduce unnecessary latency, resource contention, and failure dependencies.

The important distinction is that **database atomicity does not imply atomicity across independent systems**.

## The transactional outbox pattern

This is where patterns such as the transactional outbox become useful.

The idea is straightforward: instead of attempting to publish an event directly as part of the database transaction, persist the intent to publish it in the same transaction as the business change.

Conceptually:

```text
Database Transaction
      │
      ├── Business Data
      │
      └── Outbox Event
              │
              ▼
          COMMIT
```

Both are committed together.

A separate process can then publish the outbox event:

```text
Outbox
  │
  ▼
Publisher
  │
  ▼
Message Bus
  │
  ▼
Consumers
```

If the transaction rolls back, neither the business change nor its outbox event is committed.

If the transaction commits, the outbox record remains available for publication, even if the messaging infrastructure is temporarily unavailable.

The publisher can retry delivery without requiring the original business operation to run again.

This changes the consistency problem.

Instead of trying to make a database write and a broker publication happen atomically, the application makes the business change and the intent to publish atomic. A separate process is responsible for delivering that intent.

The message may be published later, but the system has a durable record that publication is required.

## A practical implementation

In a PostgreSQL-backed TypeScript application, the business record and outbox event can be persisted through the same Prisma transaction.

For example:

```ts
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({
    data: orderData,
  });

  await tx.outboxEvent.create({
    data: {
      eventId: crypto.randomUUID(),
      eventType: "OrderCreated",
      aggregateId: order.id,
      payload: {
        orderId: order.id,
      },
      status: "PENDING",
    },
  });
});
```

The example assumes an outbox model containing the corresponding fields.

The significant detail is that both operations use the same transaction client, `tx`.

If either operation fails, the transaction does not commit either change.

The outbox record might contain fields such as:

- `eventId`: A stable identifier for the event.
- `eventType`: The type of event to publish.
- `aggregateId`: The identifier of the business entity associated with the event.
- `payload`: The serialized event data.
- `status`: The publication state.
- `createdAt`: When the event was recorded.
- `publishedAt`: When successful publication was recorded, if applicable.
- `attempts`: The number of publication attempts.
- `lastError`: Diagnostic information about the most recent failure.

The exact schema depends on the application's requirements.

The outbox is not simply a logging table. It represents durable work that remains to be delivered.

Its lifecycle, retention policy, indexing strategy, and recovery behavior therefore deserve the same attention as other operational components.

## The publisher introduces another failure boundary

The transactional outbox solves the original dual-write problem, but it does not eliminate every failure mode.

Consider the publisher:

```text
1. Read pending outbox event
2. Publish event
3. Mark event as published
```

What happens if the message broker accepts the event but the publisher crashes before step 3?

The outbox record still appears pending.

When the publisher retries, it may publish the same event again.

This means a transactional outbox generally supports **reliable, retryable publication with possible duplicate delivery**, not automatic exactly-once processing across the database and broker.

That distinction is important.

A robust implementation should assume that an event may be delivered more than once and design its consumers accordingly.

For example, a consumer can use the stable event identifier to detect duplicate processing. For database-backed business effects, a unique constraint on the processed-event identifier can help prevent the same logical event from being applied twice.

However, deduplication and external side effects require careful handling. Recording an event as processed and performing an external action are not automatically atomic either.

The outbox moves the reliability boundary. It does not remove the need to reason about it.

## Consumer idempotency still matters

Suppose an `OrderCreated` event triggers an inventory reservation.

A consumer might receive the same event twice because the publisher retried it or the broker redelivered it.

Without appropriate safeguards, the inventory reservation could be applied twice.

A simplified processing design looks like this:

```text
Receive Event
     │
     ▼
Check Event Identity
     │
     ├── Already Processed
     │       │
     │       ▼
     │   Skip Duplicate
     │
     └── Not Processed
             │
             ▼
       Apply Business Change
             │
             ▼
       Record Event Identity
             │
             ▼
          COMMIT
```

When the business change and processed-event record belong to the same database, they can often be committed in one transaction.

A uniqueness constraint on the event identifier provides an additional safeguard against concurrent duplicate deliveries.

If processing requires an external API call, however, the consumer must consider the possibility of a crash between the external operation and the local completion record.

Depending on the operation, a provider-supported idempotency key, a durable workflow, reconciliation, or another coordination mechanism may be necessary.

The correct approach depends on the business consequence of repeating the operation.

For example, generating a report twice may be tolerable. Applying the same financial adjustment twice may not be.

Idempotency is therefore not just a messaging concern. It is a property that should be considered when designing the business operation itself.

## Polling versus change data capture

There is more than one way to publish outbox events.

### Polling

A background publisher periodically queries the outbox table for pending events.

```text
Outbox Table
     │
     ▼
Poll Pending Events
     │
     ▼
Publish to Broker
     │
     ▼
Update Publication State
```

Polling is relatively straightforward to implement and operate.

However, the implementation must account for concurrent publishers, batch sizes, event ordering, retry behavior, and the possibility of multiple workers attempting to claim the same record.

Database locking, appropriately designed claim operations, or other coordination mechanisms can help prevent unnecessary contention.

The polling interval also affects publication latency.

### Change data capture

Another approach is to use change data capture (CDC) to observe committed database changes and feed outbox records into a messaging pipeline.

This can reduce the need for an application-managed polling loop and may be appropriate for systems with higher throughput or existing streaming infrastructure.

However, CDC introduces its own operational requirements, including connector management, replication-log retention, schema evolution, monitoring, and recovery.

Neither approach is universally better.

Polling can be a good starting point for a system with moderate throughput and straightforward operational requirements. CDC may be more suitable when the scale, latency requirements, or existing infrastructure justify the additional complexity.

The choice should follow the workload rather than the popularity of the pattern.

## Event ordering and concurrent publishers

Reliable publication does not automatically guarantee that every consumer will observe events in the order the business produced them.

Suppose an order produces these events:

```text
OrderCreated
OrderConfirmed
OrderDispatched
```

If multiple publishers process pending records concurrently, or the broker distributes messages across partitions or sessions, downstream processing may observe a different order unless ordering is explicitly supported and configured.

For many workflows, this is manageable because consumers validate the current business state or process events independently.

For workflows that require ordering, the design may need to preserve order per aggregate, use a stable partition or session key where supported, or prevent later events from overtaking earlier events for the same entity.

The requirement should be explicit.

Global ordering can constrain throughput unnecessarily. Per-aggregate ordering is often sufficient when events concern independent business entities.

The outbox schema and publisher strategy should reflect that distinction.

## Retries, dead-lettering, and operational recovery

A publisher needs a clear response to failures.

Temporary broker unavailability may justify retries with exponential backoff. Invalid message contracts or permanently rejected messages may require investigation instead of endless retries.

A production design should establish:

- Which failures are retryable.
- How retry delays are calculated.
- Whether retries have a maximum or continue until resolved.
- How permanently failing events are isolated.
- How operators inspect and replay failed events.
- How long published records are retained.
- How publication lag is monitored.

A dead-letter mechanism can isolate messages that cannot be processed automatically, but moving a message to a dead-letter queue does not resolve the underlying business problem.

Likewise, deleting a failed outbox record may remove the evidence that a required business event was never delivered.

Recovery should be deliberate and auditable.

Useful operational metrics include the number of pending events, the age of the oldest pending event, publication failures, retry counts, and the time between event creation and successful publication.

These signals reveal whether the asynchronous pipeline is keeping up with the business workload.

## This connects to previous decisions

This is why database architecture and messaging architecture cannot always be designed independently.

The moment a business operation produces an external side effect, consistency becomes an architectural concern.

It also connects to how I approach application-level messaging boundaries.

An application should not need to know whether its event is eventually published through BullMQ, Azure Service Bus, or another messaging infrastructure. However, the application still needs a reliable way to record the obligation to publish that event.

The outbox provides that durable boundary between the database transaction and the messaging infrastructure.

The publisher can then implement the transport-specific behavior, while consumers handle idempotency and the business effects associated with the event.

These responsibilities are separate, but they must work together.

Not every operation needs an outbox. A best-effort cache refresh may not justify one. A business workflow that must not silently lose an event may.

The decision should reflect the consequences of failure.

## Final thought

Distributed systems often fail at the boundaries between systems.

Understanding those boundaries is more valuable than memorizing patterns.

The outbox pattern is useful because it addresses one specific consistency problem: reliably connecting database state changes with asynchronous messaging.

It does not eliminate duplicate delivery, guarantee exactly-once execution, or make every external side effect atomic.

It gives the application a durable record of what must be published and a mechanism for recovering when the messaging infrastructure is unavailable.

That is the distinction that matters when designing reliable backend systems.

The goal is not to add patterns everywhere.

It is to understand which failure a pattern addresses, which guarantees it provides, and which responsibilities still belong elsewhere in the architecture.
