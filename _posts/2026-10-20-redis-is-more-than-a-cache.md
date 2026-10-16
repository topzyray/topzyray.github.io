---
title: "Redis Is More Than a Cache"
date: 2026-10-20 06:00:00 +0100
description: "Explore Redis for caching, rate limiting, sessions, coordination, messaging, and background jobs, with attention to trade-offs and failure modes."
categories:
  - Backend Engineering
  - Node.js
tags:
  - redis
  - caching
  - nodejs
  - bullmq
  - backend-architecture
  - distributed-systems
  - performance
  - rate-limiting
  - message-queues
---

Redis is frequently introduced to developers as a caching system.

That is only one of its uses.

In backend architecture, Redis can participate in several different patterns, including caching, session management, rate limiting, distributed coordination, real-time messaging, and background-job infrastructure.

Its usefulness comes from more than simply storing data in memory. Redis provides data structures and operations that can help applications solve specific problems without repeatedly querying a database or performing expensive computations.

However, using Redis effectively requires understanding what each pattern is responsible for, what guarantees it provides, and what happens when things fail.

## Cache and queue are different responsibilities

A cache answers:

> Can I retrieve this expensive result without recomputing it?

A queue answers:

> Can I defer this piece of work and process it asynchronously?

They are different problems.

A technology can support both without making the concepts identical.

For example, an application might use Redis to cache a user's profile while also using BullMQ to schedule email delivery, report generation, or other background tasks.

The cached profile is optimized for repeated reads. The queued job represents work that must be executed, retried, or scheduled according to the queue's processing rules.

These responsibilities should remain separate in the application architecture, even when they share the same Redis infrastructure.

## Read-through caching

A useful cache pattern is:

```text
Request
  │
  ▼
Cache
  │
  ├── Hit → Return
  │
  └── Miss
        │
        ▼
     Database
        │
        ▼
      Cache
        │
        ▼
      Return
```

In a read-through-style flow, the application retrieves data from the cache first. When the requested data is missing, it reads from the database and populates the cache.

Strictly speaking, this is often implemented as a cache-aside pattern: the application explicitly manages cache reads, database reads, and cache population.

For example, a NestJS service might use Redis to cache frequently accessed organizational settings, product catalog entries, or permission metadata.

```typescript
async function getOrganizationSettings(
  organizationId: string,
): Promise<OrganizationSettings> {
  const key = `organization:${organizationId}:settings`;

  const cached = await redis.get(key);

  if (cached !== null) {
    return JSON.parse(cached) as OrganizationSettings;
  }

  const settings = await organizationRepository.getSettings(organizationId);

  await redis.set(key, JSON.stringify(settings), {
    EX: 300,
  });

  return settings;
}
```

This example uses a five-minute expiration.

The actual implementation should also validate cached data, handle serialization failures appropriately, and decide what happens when Redis is unavailable.

The cache should improve the application's performance without becoming an accidental prerequisite for retrieving data that remains available in the primary database.

## Cache invalidation is the difficult part

Adding a cache is easy.

Keeping cached data correct is harder.

Questions include:

- When does the cache expire?
- When is it invalidated?
- What happens after an update?
- What happens if the database succeeds but cache invalidation fails?
- Can stale data be tolerated?

These are architectural questions.

Consider an organization whose approval limit changes from ₦500,000 to ₦1,000,000.

If the database is updated but Redis still contains the previous limit, the application may continue making decisions based on outdated information.

For display-oriented data, a short period of staleness may be acceptable. For authorization, financial controls, or approval decisions, it may not be.

Common strategies include:

- **TTL-based expiration:** Allow entries to expire after a defined period.
- **Explicit invalidation:** Delete or update affected cache entries after a successful database write.
- **Versioned cache keys:** Include a version in the key to prevent old entries from being reused.
- **Write-through approaches:** Update the database and cache through a coordinated application strategy.
- **Event-driven invalidation:** Publish changes and invalidate related entries through a reliable event-processing mechanism.

None of these strategies eliminates every failure mode.

For example, if a database transaction commits successfully but the application crashes before invalidating Redis, the cache can remain stale.

For important workflows, an outbox pattern can help: record the business change and an event in the same database transaction, then process that event asynchronously to invalidate or refresh the cache.

The key lesson is that cache consistency must be designed, not assumed.

## Redis data structures are part of the value

Redis is not limited to storing serialized JSON strings.

It supports data structures with operations suited to different access patterns.

| Data structure | Useful applications                                       |
| -------------- | --------------------------------------------------------- |
| Strings        | Cache entries, counters, temporary tokens                 |
| Hashes         | Compact representations of objects and fields             |
| Sets           | Unique membership, feature assignments, membership checks |
| Sorted sets    | Leaderboards, priority ordering, scheduled work indexes   |
| Lists          | Simple ordered collections and queue-like operations      |
| Streams        | Append-only event records and consumer groups             |
| Bitmaps        | Compact tracking of binary states                         |
| HyperLogLogs   | Approximate distinct-count analytics                      |

The important distinction is between choosing Redis because it is available and choosing a Redis data structure because its operations match the problem.

For example, a sorted set can support a leaderboard without repeatedly sorting an entire dataset in application memory.

A set can efficiently track membership, such as which feature flags have been assigned to a particular group.

A counter can support lightweight operational metrics, subject to appropriate expiration, cardinality, and retention policies.

The data structure should follow the access pattern and consistency requirements.

## Rate limiting

Rate limiting is another common use of Redis.

An API may need to restrict how frequently a client can make requests within a given period.

For example:

```text
Incoming Request
      │
      ▼
Identify Client
      │
      ▼
Check Rate Limit in Redis
      │
      ├── Within Limit → Continue
      │
      └── Limit Exceeded → Reject
```

A Redis-backed limiter can maintain counters shared across multiple application instances.

Without shared state, an application running on four replicas could enforce four independent limits instead of one limit across the entire deployment.

Redis operations such as `INCR` and expiration can implement simple fixed-window limits. However, the counter update and expiration setup must be designed to avoid race conditions, and a fixed window can allow bursts around window boundaries.

Depending on the requirements, a sliding-window or token-bucket algorithm may be more appropriate.

Rate limiting is useful for:

- Login and password-reset endpoints.
- Public APIs.
- OTP and verification-code requests.
- Expensive report-generation endpoints.
- Protection against accidental request bursts.

The key design questions include the limiting identity, the time window, the permitted burst size, and the behavior when Redis becomes unavailable.

A global rate limit, a per-user limit, and a per-IP limit are different policies. They should not be treated as interchangeable.

## Session management and temporary state

Redis can also store temporary application state.

Examples include:

- Server-side sessions.
- Short-lived verification challenges.
- Temporary workflow state.
- One-time application tokens.
- Expiring reservations or locks.

This is particularly useful when an application runs across multiple instances.

If a session exists only in the memory of one Node.js process, a subsequent request routed to another instance may not find it.

Shared session storage allows instances to retrieve the same session state.

However, not every token should automatically be stored in Redis. The application must define expiration, revocation, access controls, and the consequences of Redis data loss.

For example, a password-reset challenge should expire and should not remain valid indefinitely simply because its key was never explicitly deleted.

Temporary state is still security-relevant state.

## Distributed locks and coordination

Suppose several application instances attempt to generate the same monthly report simultaneously.

Or imagine multiple workers trying to perform the same scheduled reconciliation.

Redis can help coordinate such work through carefully designed locking or deduplication mechanisms.

A simplified lock acquisition might look like:

```text
SET lock:monthly-report token NX PX 30000
```

Here:

- `NX` requests creation only if the key does not already exist.
- `PX 30000` gives the lock a 30-second expiration.
- `token` should be a unique ownership value.

The owner must release the lock only if the stored token still matches its own token. Otherwise, an expired lock could be acquired by another worker, and the original worker could accidentally delete the new owner's lock.

A simple lock implementation is not automatically a complete distributed-locking solution.

Long-running work, process pauses, network partitions, lock expiry, and delayed operations can all create concurrency problems.

For operations where duplicate execution could cause serious damage, consider database constraints, idempotency keys, transactional guarantees, or fencing tokens in addition to coordination.

A lock can reduce contention, but it should not replace the underlying correctness guarantees of the business operation.

## Background jobs with BullMQ

Redis can also support queue infrastructure such as BullMQ.

That creates a useful separation:

```text
Application
    │
    ├── Cache
    │
    └── Job Queue
           │
           ▼
        Workers
           │
           ├── Email delivery
           ├── Report generation
           ├── File processing
           └── Notifications
```

But the application should not confuse those responsibilities.

Imagine an API endpoint that accepts a request to generate a large report.

Generating the report inside the HTTP request can increase response times and consume application resources while the client waits.

Instead, the API can validate the request, persist the necessary business state, enqueue a job, and return a job identifier.

A worker processes the job independently.

BullMQ supports capabilities such as delayed jobs, retries, repeatable scheduling, concurrency controls, and job prioritization.

These capabilities are useful, but they do not mean every queued job will execute exactly once.

A worker may complete an external side effect and crash before acknowledging the job. The queue may then retry it.

Consequently, a production job handler should be designed to tolerate repeated execution.

For example, an invoice-notification job should check whether the relevant notification has already been recorded or use an appropriate idempotency mechanism before performing a non-repeatable side effect.

Similarly, retry policies should distinguish transient failures from permanent failures. Repeatedly retrying an invalid request does not make it valid.

The queue is responsible for managing work. The application is responsible for making that work safe to execute.

## Pub/Sub and Redis Streams

Redis can also support communication between application components.

However, Pub/Sub and Streams serve different purposes.

**Redis Pub/Sub** allows publishers to send messages to subscribers. It is useful for transient notifications, but messages are not retained for subscribers that are disconnected when the message is published.

For example, an application could publish a notification that a dashboard should refresh its data.

**Redis Streams** provide a retained, ordered stream of entries, with consumer-group capabilities for distributing processing across consumers and tracking pending messages.

Streams can be useful for event-processing workflows that require consumers to resume work after interruptions.

Even then, retention, acknowledgment, pending-message recovery, consumer coordination, and duplicate handling must be designed explicitly.

Neither Pub/Sub nor Streams should automatically be treated as a substitute for a durable business record in a relational database.

The appropriate choice depends on whether the application needs transient notification, retained event processing, or a durable source of business truth.

## Redis is not automatically the source of truth

One of the most important architectural decisions is determining which system owns the authoritative version of a piece of data.

For many business applications, PostgreSQL or another primary database remains responsible for durable business records, constraints, and transactions.

Redis can then support performance, coordination, temporary state, and asynchronous processing.

For example:

```text
PostgreSQL
    │
    ├── Authoritative business records
    ├── Transactional constraints
    └── Durable workflow state

Redis
    │
    ├── Cached reads
    ├── Rate-limit counters
    ├── Temporary state
    └── Queue and coordination infrastructure
```

This is an architectural choice, not a universal rule that Redis can never be a primary datastore.

Redis supports persistence and other durability-related features. However, its actual recovery guarantees depend on the configuration, persistence mode, replication, failover behavior, and operational setup.

If losing a piece of data would violate a business requirement, its storage and recovery strategy must be evaluated accordingly.

A cache entry can usually be rebuilt.

An unrecorded payment, an unprocessed business obligation, or a lost approval decision may have much more serious consequences.

Those data categories should not receive the same reliability assumptions.

## Redis introduces operational trade-offs

Redis can improve application performance, but it also introduces infrastructure and operational costs.

### Memory management

Redis is commonly used as an in-memory datastore. Memory is therefore a resource that must be monitored and managed.

Applications should consider:

- Memory limits and eviction policies.
- Key expiration and retention.
- Large values and expensive data structures.
- Unexpected growth in the number of keys.
- Cache churn and eviction rates.

An eviction policy that works well for a disposable cache may be inappropriate for data that the application expects to retain.

### Connection management

Creating a new Redis connection for every request is usually a poor approach.

Node.js applications should generally reuse managed connections, configure sensible timeouts, and handle reconnection behavior deliberately.

Connection pooling or multiplexing should follow the behavior of the selected Redis client and workload.

### Redis outages

A cache outage and a queue outage have different consequences.

If Redis is used only as a cache, the application might temporarily fall back to the database, provided that doing so will not overwhelm it.

If Redis also backs background-job infrastructure, an outage may prevent jobs from being enqueued or processed.

A fallback strategy must account for these differences.

For example, sending every cache miss directly to PostgreSQL during a Redis outage can create a database traffic spike. A controlled fallback, load shedding, or temporary rejection of nonessential requests may be safer.

Likewise, silently discarding a job because Redis is unavailable may violate the business contract of the endpoint.

Resilience begins with identifying which operations can fail open, which must fail closed, and which require durable recovery.

### Monitoring

A production deployment should monitor Redis as an infrastructure dependency.

Useful signals include:

- Memory consumption and evictions.
- Command latency and slow operations.
- Connection counts and rejected connections.
- Cache hit and miss rates.
- Queue depth and oldest-job age.
- Failed, stalled, and repeatedly retried jobs.
- Replication health and persistence-related failures where applicable.

These metrics help distinguish an application problem from an infrastructure problem.

A cache hit rate alone is not sufficient evidence that Redis is improving the system. The cache must also reduce meaningful latency or database load without introducing unacceptable staleness or operational complexity.

## A practical rule for backend engineers

Before introducing Redis into a feature, answer these questions:

1. **What problem are we solving?** Is it repeated computation, request throttling, coordination, temporary state, or deferred work?
2. **What is the source of truth?** Can the data be reconstructed, or must it survive failure?
3. **What consistency guarantees are required?** Can the application tolerate stale data or duplicate processing?
4. **What happens when Redis is unavailable?** Can the operation safely fall back, wait, retry, or fail?
5. **How will the feature be monitored?** Which metrics will show that the design is working?
6. **Is Redis necessary?** Would a database constraint, an existing queue, or a simpler application-level solution solve the problem with fewer moving parts?

The goal is not to use Redis in as many places as possible.

It is to use it where its data structures and operational characteristics provide a clear advantage.

## Final thought

Redis is a useful infrastructure component.

The important engineering skill is not knowing that Redis exists.

It is understanding **which problem Redis is solving in a particular part of the architecture**.

A cache should have an explicit consistency strategy. A queue should have a retry and idempotency strategy. A rate limiter should have a defined policy. A distributed lock should have clear ownership and failure semantics.

Those decisions are what separate simply adding Redis to a backend from designing a backend that uses Redis responsibly.
