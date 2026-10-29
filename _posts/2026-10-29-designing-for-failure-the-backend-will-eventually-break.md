---
title: "Designing for Failure: The Backend Will Eventually Break"
date: 2026-10-29 06:00:00 +0100
description: "Build resilient backends with timeouts, safe retries, idempotency, graceful degradation, durable queues, and observable failure handling."
categories:
  - Backend Engineering
  - Reliability
tags:
  - reliability
  - nodejs
  - distributed-systems
  - resilience
---

One of the biggest changes in my approach to backend engineering has been thinking about failure before it happens.

A system is not production-ready simply because the happy path works.

In development, dependencies are often available, requests complete successfully, and datasets remain small enough for operations to finish quickly. Under production conditions, these assumptions become less reliable.

A database connection can fail. An external API can respond slowly. A background worker can crash halfway through a job. A deployment can interrupt an operation. A network timeout can leave the application uncertain about whether a request succeeded.

These are not necessarily signs of poor engineering. They are realities of building systems that depend on software, infrastructure, and networks that cannot guarantee uninterrupted operation.

The engineering question is not whether failure will happen.

It is whether the system can handle it without losing data, duplicating operations, or leaving its business state inconsistent.

## Dependencies fail

A backend may depend on:

- PostgreSQL;
- Redis;
- queues;
- email providers;
- payment providers;
- object storage;
- external APIs.

Any of them can become unavailable.

They can also become slow, return unexpected responses, exhaust their resource limits, or fail in ways that leave the outcome of an operation uncertain.

The distinction between a dependency being unavailable and a dependency being slow matters. An unavailable service may fail requests immediately, while a slow service can keep connections occupied, increase request latency, and consume resources across the application.

For example, if an API waits indefinitely for an external provider, incoming requests may accumulate until the application itself becomes unhealthy.

A database outage can prevent reads and writes. A Redis outage may affect caching, rate limiting, or queue processing, depending on how Redis is used. An email provider outage may delay notifications without necessarily preventing a business transaction from completing.

The correct response depends on the role of the dependency.

This is why I do not think every dependency failure should be handled in the same way.

For each dependency, the application needs to understand which operations require it, which operations can be delayed, and which functions can continue in a degraded state.

## Network failures are particularly important

The data-import work I discussed earlier provided a practical reminder of this.

A network failure does not necessarily mean the entire operation should become unrecoverable.

Systems need:

- timeouts;
- retries where appropriate;
- idempotency;
- resumability;
- failure visibility.

Consider a data-import job processing thousands of personnel records. If the network connection fails after several batches have been committed, restarting the entire import from the beginning may waste resources and introduce duplicate records or conflicting updates.

A better design tracks progress and makes the operation safe to resume.

For example, a batch-processing workflow might look like this:

```text
Import Job
    │
    ▼
Validate Input
    │
    ▼
Process Batch
    │
    ├── Success ──► Persist Progress
    │                    │
    │                    ▼
    │                Next Batch
    │
    └── Failure ──► Record Error
                         │
                         ▼
                    Retry or Resume
```

The exact recovery strategy depends on the operation, but the underlying principle remains the same: progress should be durable enough to recover from interruption.

A resumable workflow needs a reliable definition of what has completed. That may involve batch identifiers, checkpoints, unique record keys, job status, or a combination of these.

It must also distinguish between a batch that definitely failed and one whose outcome is unknown. If the database committed a batch but the client lost the connection before receiving confirmation, blindly processing that batch again could repeat its effects.

Resumability therefore depends on more than remembering the last batch number. It requires a clear strategy for determining which operations have already been applied.

## Timeouts are part of the design

Every external operation should have a deliberate timeout strategy.

Without timeouts, requests may wait longer than the application can reasonably tolerate. Under load, those waiting requests can consume connections, memory, and other resources that would otherwise serve useful work.

Timeouts should reflect the expected behavior of the operation and the overall request budget.

A short database query may need a much shorter timeout than a large report generation job. A payment verification request may have a different budget from an asynchronous email delivery attempt.

The timeout should also account for the remaining time available to the caller. There is little value in starting an operation that cannot reasonably finish before the original request must return.

In Node.js, this often means configuring timeouts at the HTTP client, database, queue, and server layers rather than assuming that one global timeout covers every dependency.

An `AbortSignal` can help cancel supported HTTP requests when a deadline expires, but cancellation is not a guarantee that the remote system has stopped processing the operation.

That distinction becomes critical for financial transactions and other operations with external side effects.

A timeout tells us that we did not receive a result within the expected period. It does not necessarily tell us what happened on the other side of the network.

## Retries can also be dangerous

A retry is not automatically safe.

Consider:

```text
Create payment
   ↓
Timeout
   ↓
Retry
```

If the first request actually succeeded but the response was lost, the retry could create a duplicate operation unless the system has appropriate idempotency controls.

The same risk applies to order creation, payouts, message publication, and other operations that produce side effects.

Retries are most useful when the failure is likely to be temporary and repeating the operation is safe.

A robust retry strategy should consider:

- whether the failure is transient;
- whether the operation is idempotent;
- whether the request outcome is known;
- how many attempts are permitted;
- how long the system should wait between attempts;
- whether the operation can finish within its deadline.

Exponential backoff can reduce pressure on a struggling dependency by increasing the delay between attempts. Jitter can help prevent many clients from retrying simultaneously and creating another surge of traffic.

Retry limits are equally important. Retrying indefinitely can turn a temporary failure into a persistent resource problem.

Some failures should not be retried automatically. Invalid input, failed authorization, and other permanent errors generally require a different response from a connection reset or temporary service unavailability.

The retry policy should therefore be designed around the operation's semantics, not applied indiscriminately to every error.

## Idempotency makes recovery safer

Idempotency is one of the most useful properties in reliable backend design.

An operation is idempotent when repeating it produces the same intended effect as performing it once.

For example, setting an order's status to a specific value can be idempotent when implemented with appropriate state-transition rules. Creating a new payment or issuing a payout is not automatically idempotent because repeating the operation may create another financial effect.

An idempotency key can allow the application or an external provider to recognize repeated attempts belonging to the same logical operation.

For an API that supports idempotent requests, the backend may store the key, associate it with the operation and its outcome, and return the existing result when the same request is received again.

The implementation must define how keys are scoped, how long they remain valid, and what happens if the same key is reused with a different payload. Concurrent requests using the same key must also be handled safely.

Idempotency is not a universal guarantee that every side effect will happen exactly once. It is a mechanism for controlling repeated attempts within a defined boundary.

When an operation spans multiple systems, each boundary may need its own deduplication or idempotency strategy.

This is particularly important when a database transaction succeeds but publishing an event fails, or when a webhook is delivered repeatedly. The application must be able to recover without repeating the business effect.

## Failure should be part of design

For each external dependency, I increasingly want to ask:

```text
What happens if it is slow?
What happens if it is unavailable?
What happens if it returns an error?
What happens if the response is lost?
What happens if the same operation is delivered twice?
```

These questions reveal architectural weaknesses early.

I would extend them further:

- What happens if the process crashes halfway through the operation?
- What happens if the database commits but the client never receives confirmation?
- What happens if a dependency recovers but the backlog has grown significantly?
- What happens if a retry succeeds after a newer operation has already changed the state?
- How will the system detect the failure?
- How can the operation be recovered without corrupting existing data?

These are not questions that need elaborate answers for every small feature. Their importance depends on the cost of failure.

A non-critical notification may be safely retried later. A payment, an inventory adjustment, or an approval affecting an official record may require stronger guarantees, explicit audit history, and a more controlled recovery process.

Failure handling should reflect the business consequences of getting the outcome wrong.

## Graceful degradation and isolation

A resilient application should not necessarily stop working whenever one dependency fails.

Sometimes, it can continue operating with reduced functionality.

For example, if a dashboard's optional analytics service is unavailable, the application may still display the primary operational data. If an email provider is down, the system may record a notification request for later delivery rather than reject an otherwise valid business operation.

This is graceful degradation: preserving essential functionality when non-essential capabilities are unavailable.

However, degradation must be deliberate. It is not appropriate to silently skip a mandatory authorization check, accept an unverified payment, or report an operation as completed when its essential business conditions have not been met.

Isolation also matters.

A circuit breaker can temporarily stop requests to a dependency that is repeatedly failing, allowing the system to avoid wasting resources on calls that are unlikely to succeed. Bulkheads can isolate resource pools or workloads so that a failure in one area does not exhaust resources needed by another.

These patterns can help, but they introduce their own state and recovery behavior. A circuit breaker needs appropriate thresholds and reset behavior. Resource isolation needs capacity limits that reflect the workload.

The goal is not to add resilience patterns everywhere. It is to prevent a local failure from unnecessarily becoming a system-wide failure.

## Queues improve recovery, but do not remove failure

Background queues can separate work that does not need to complete within the original request from the request-response lifecycle.

For example, sending emails, generating reports, or processing large imports may be better handled asynchronously.

A queue can provide retries and allow workers to recover from temporary failures. It can also help smooth bursts of incoming work.

But queues introduce their own failure scenarios:

- a worker may crash while processing a job;
- a message may be delivered more than once;
- a job may repeatedly fail;
- the backlog may grow faster than workers can process it;
- a message may be acknowledged before the business effect is durably recorded.

A reliable worker must therefore consider idempotency, acknowledgement timing, retry limits, dead-letter handling, and monitoring.

Queue acceptance also does not mean business completion. It means that work has been accepted according to the queue's guarantees. The application must still track whether that work has actually finished.

This connects directly to the broader principle of designing reliable background jobs and coordinating database changes with asynchronous events.

## Observability makes failure visible

A system cannot recover intelligently from failures that nobody can detect.

Logs, metrics, traces, and operational alerts provide different views of what is happening.

Structured logs can help explain which operation failed and what context was involved. Metrics can reveal increasing latency, error rates, retry counts, and growing backlogs. Distributed traces can show how time is spent across services and where a request begins to fail.

For important workflows, I want to be able to answer questions such as:

- Which operation failed?
- Which dependency was involved?
- Was the operation retried?
- Is the outcome known or uncertain?
- Did any business side effects already occur?
- Can the operation be resumed safely?
- Is the failure isolated or affecting other requests?

Correlation identifiers and durable operation identifiers can help connect logs and events across the lifecycle of a request or job. Sensitive values, credentials, and payment secrets should not be exposed in those logs.

Observability is not simply about collecting more data. It is about collecting enough useful information to understand the failure, assess its impact, and choose the correct recovery action.

## Final thought

Reliability is not the absence of failure.

It is the system's ability to behave predictably when failure occurs.

That requires more than catching exceptions. It requires explicit timeouts, carefully designed retries, idempotent operations, durable progress, observable failures, and recovery strategies that respect the business state.

A production system should not depend on every request succeeding, every dependency remaining available, or every message arriving exactly once.

It should be designed around the reality that these assumptions will eventually fail.

That is a very different engineering goal.
