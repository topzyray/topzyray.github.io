---
title: "Designing Background Jobs Without Marrying the Application to a Queue"
date: 2026-10-21 06:00:00 +0100
description: "Use messaging boundaries to keep application workflows independent of queue providers while preserving delivery guarantees, idempotency, and job semantics."
categories:
  - Backend Engineering
  - Architecture
tags:
  - nodejs
  - typescript
  - queues
  - bullmq
  - redis
  - azure-service-bus
  - messaging
  - distributed-systems
  - clean-architecture
  - system-design
---

Background processing is an important part of backend systems.

Email delivery, notifications, reports, imports and other long-running operations do not always belong inside the HTTP request.

Some operations are too expensive to execute synchronously. Others depend on external services that may be slow or temporarily unavailable. In many cases, the API should accept a request, record the necessary business state, and allow a worker to complete the operation independently.

The architectural question is how to introduce asynchronous processing without coupling the entire application to one queue technology.

## The direct approach

A service might do this:

```ts
await queue.add("send-email", payload);
```

That works.

For a small application, it may even be sufficient.

However, as the application grows, the queue client can start appearing throughout application services, controllers, and business workflows.

The problem is not the method call itself. The problem is the dependency it introduces.

If application services depend directly on BullMQ, for example, they become aware of concepts and behaviors associated with that infrastructure. Switching to Azure Service Bus may then require changes beyond the infrastructure layer.

The application may also become coupled to provider-specific options such as job priorities, delay settings, retry configuration, and scheduling APIs.

That is a dependency-management problem, not merely a queue-management problem.

## Introduce a messaging boundary

A better boundary can be:

```ts
interface MessageBus {
  publish<T>(message: DomainMessage<T>): Promise<void>;
}
```

The application can then say:

```ts
await messageBus.publish({
  type: "EmailRequested",
  payload,
});
```

The infrastructure decides how to deliver it.

This follows the dependency inversion principle: application-level code depends on an abstraction, while concrete messaging infrastructure implements that abstraction.

The business operation expresses what needs to happen. The infrastructure determines how the message is transported.

A more complete TypeScript contract might look like this:

```ts
export interface MessageEnvelope<TPayload> {
  messageId: string;
  type: string;
  version: number;
  occurredAt: string;
  correlationId?: string;
  payload: TPayload;
}

export interface MessageBus {
  publish<TPayload>(message: MessageEnvelope<TPayload>): Promise<void>;
}
```

The envelope provides a stable place for message identity, schema versioning, timestamps, and request correlation.

These fields become useful when investigating failures across HTTP requests, background workers, and external services.

The `version` field also provides a foundation for evolving message contracts without assuming that every producer and consumer will be deployed simultaneously.

One important distinction: a message such as `EmailRequested` is generally an application or integration message, not necessarily a domain event. A domain event describes something meaningful that has happened in the business, such as `OrderConfirmed`. A command or request asks for an operation to be performed.

These concepts can share transport infrastructure, but they should retain their distinct meanings.

## Separate publishing from processing

A messaging boundary is only one part of the architecture.

The consumer also needs a boundary between message delivery and business processing.

A simplified design looks like this:

```text
HTTP Request
     │
     ▼
Application Service
     │
     ▼
MessageBus Interface
     │
     ▼
Messaging Adapter
     │
     ├── BullMQ / Redis
     │
     └── Azure Service Bus
                  │
                  ▼
              Consumer
                  │
                  ▼
          Application Handler
                  │
                  ▼
           Business Operation
```

The producer and consumer can now evolve independently of the underlying transport.

The HTTP application does not need to know how a worker receives messages. Likewise, the business handler does not need to know whether the message arrived through a Redis-backed queue or a cloud messaging service.

For example, a report-generation handler should be concerned with validating the request, generating the report, storing the output, and recording the result.

It should not need to know how BullMQ acknowledges a job or how Azure Service Bus settles a message.

Those concerns belong in the infrastructure adapter.

## Why I care about this

I have specifically been designing systems where the messaging infrastructure should not be permanently tied to one provider.

For example:

```text
MessageBus
   │
   ├── BullMQ / Redis
   │
   └── Azure Service Bus
```

The business operation should not have to change simply because the transport changes.

This is particularly useful when an application begins with a lightweight Redis-backed queue but later requires managed messaging infrastructure, different operational capabilities, or integration with other enterprise systems.

However, provider independence should be an architectural objective rather than a promise that switching providers will always be effortless.

The application should isolate provider-specific dependencies while explicitly defining the capabilities it requires.

A transport change may still require infrastructure configuration, deployment changes, operational adjustments, and changes to message routing.

The purpose of the boundary is to prevent those changes from unnecessarily spreading through the business logic.

## Define the abstraction around application needs

An abstraction should describe the capabilities the application actually needs.

For example, if the application only needs to publish background work, a small interface may be sufficient:

```ts
export interface BackgroundJobPublisher {
  publish<TPayload>(message: MessageEnvelope<TPayload>): Promise<void>;
}
```

If the application needs delayed delivery, scheduling, or explicit routing, those capabilities should be introduced deliberately.

They should not be added merely because one provider exposes them.

Consider these examples:

```ts
// Application-level intent
await jobPublisher.publish(message);
```

Compare that with:

```ts
// Provider-specific behavior leaking into application code
await bullQueue.add("generate-report", payload, {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 2_000,
  },
  removeOnComplete: true,
});
```

The second example is not inherently bad. Those options are useful when configuring BullMQ.

The architectural problem appears when business services must understand and reproduce those settings across multiple providers.

Instead, infrastructure configuration should translate application-level policies into provider-specific options.

For example, an application may define a retry policy for transient report-generation failures. The BullMQ adapter can translate that policy into its retry configuration, while an Azure Service Bus adapter can implement the appropriate delivery, redelivery, and dead-letter behavior supported by that platform.

The abstraction should remain small enough to be understandable and explicit enough to preserve the guarantees the application needs.

## But abstraction must preserve semantics

A queue abstraction cannot pretend that every messaging platform behaves identically.

The design must account for the semantics the application actually needs.

This includes questions around:

- Retries.
- Ordering.
- Acknowledgement and settlement.
- Dead-lettering.
- Idempotency.
- Delivery guarantees.
- Delayed delivery and scheduling.
- Message expiration.
- Concurrency and backpressure.

These differences matter because two providers may expose similar APIs while providing different operational guarantees.

For example, BullMQ manages jobs through Redis and provides job-oriented capabilities such as retries, delays, and concurrency controls.

Azure Service Bus provides managed messaging capabilities, including message settlement, delivery-count handling, and dead-letter queues.

A successful method call to publish a message also does not mean the business operation has completed. It means the message was accepted according to the publishing mechanism's guarantees.

The consumer may execute later, fail, retry, or encounter a permanent error.

The application must define what success means at each stage.

## Delivery guarantees and idempotency

Distributed messaging systems can deliver the same logical work more than once.

A worker may complete an external operation and then fail before acknowledging the message. The infrastructure may redeliver the message because it cannot establish that processing completed successfully.

This means an application should not assume that a job handler executes exactly once merely because its queue has retries or acknowledgement support.

Consider a notification workflow:

```text
Message Received
       │
       ▼
Send Notification
       │
       ▼
Record Completion
       │
       ▼
Acknowledge Message
```

If the process crashes after sending the notification but before recording completion, a retry could send the notification again.

An idempotent consumer is designed to handle repeated delivery without repeating the business effect unnecessarily.

One approach is to assign a stable message identifier and record processed messages in a durable store with a suitable uniqueness constraint.

However, a deduplication record alone does not make every external side effect atomic. If sending an email and recording its completion are separate operations, a crash can still occur between them.

For external effects, the design may need provider-supported idempotency keys, durable delivery records, reconciliation, or a workflow that explicitly handles uncertain outcomes.

The correct solution depends on the business operation.

For example, duplicate report-generation work may be acceptable if the output is safely replaceable. Duplicate financial transfers are not.

The messaging abstraction must not hide these differences.

## The database transaction problem

One of the most important failure cases appears when an application writes to a database and publishes a message as part of the same business operation.

Consider this sequence:

```text
1. Save Order to PostgreSQL
2. Publish OrderConfirmed
```

What happens if the database transaction commits successfully but the message publication fails?

The order exists, but downstream consumers may never receive the event.

Reversing the order does not eliminate the problem. The message might be published successfully while the database transaction subsequently rolls back.

This is the dual-write problem.

For business operations that require reliable event publication, the transactional outbox pattern is a common solution.

```text
Database Transaction
        │
        ├── Save Business Record
        │
        └── Save Outbox Message
                  │
                  ▼
             Transaction Commit
                  │
                  ▼
            Outbox Publisher
                  │
                  ▼
              Message Bus
                  │
                  ▼
               Consumer
```

The business record and its outbox message are committed in the same database transaction.

A separate publisher reads pending outbox records and publishes them to the configured messaging infrastructure. After successful publication, it records the appropriate delivery state.

The publisher may still crash after sending a message but before marking the outbox record as published. Therefore, duplicate publication remains possible, and consumers should be designed accordingly.

The outbox pattern does not create a distributed transaction between PostgreSQL and the queue. It makes the intent to publish durable and recoverable.

It is particularly useful for order processing, approvals, financial workflows, and other operations where losing an event would create an inconsistent business state.

For a best-effort cache refresh or noncritical notification, the added complexity may not be justified. The reliability requirement should determine the pattern.

## Publishing is not the same as processing

A clean messaging boundary should distinguish the acceptance of a message from the completion of its work.

For example:

```ts
await messageBus.publish(message);
```

This should not imply that the email has been delivered or the report has been generated.

It should mean that the publishing operation completed according to the contract defined by the adapter.

The application may return a response such as:

```json
{
  "status": "accepted",
  "messageId": "msg_123"
}
```

The exact response depends on the API contract.

If the client needs to know when processing finishes, the application needs an additional mechanism, such as a persisted job-status resource, a notification, or a polling endpoint.

This distinction prevents an asynchronous API from promising synchronous completion.

It also helps separate three different concerns:

- **Acceptance:** Was the work successfully submitted?
- **Execution:** Did a worker process it successfully?
- **Business completion:** Was the intended business outcome achieved and recorded?

Those states may occur at different times and should not be conflated.

## Avoid building a generic messaging framework

There is a temptation to create an abstraction that supports every conceivable queue feature.

For example:

```ts
interface UniversalQueue {
  publish(): Promise<void>;
  schedule(): Promise<void>;
  cancel(): Promise<void>;
  retry(): Promise<void>;
  acknowledge(): Promise<void>;
  deadLetter(): Promise<void>;
  changePriority(): Promise<void>;
}
```

This can become a lowest-common-denominator abstraction that either exposes provider-specific details everywhere or fails to express the capabilities of individual providers accurately.

Not every messaging technology supports the same operations in the same way.

A better approach is to define a small core contract and introduce additional interfaces only when the application genuinely requires those capabilities.

For example:

```ts
interface MessagePublisher {
  publish<TPayload>(message: MessageEnvelope<TPayload>): Promise<void>;
}

interface ScheduledMessagePublisher extends MessagePublisher {
  publishAt<TPayload>(
    message: MessageEnvelope<TPayload>,
    scheduledAt: Date,
  ): Promise<void>;
}
```

Even this extension should be introduced only when scheduling is a real application requirement.

If scheduling semantics differ between providers, the contract must define what `scheduledAt` means, what happens when a message is late, and how cancellation or rescheduling works.

A smaller abstraction with explicit limitations is often more maintainable than a universal interface that promises capabilities it cannot consistently deliver.

## Organize the TypeScript implementation around boundaries

In a TypeScript backend, one possible feature-oriented structure is:

```text
src/
├── modules/
│   └── notifications/
│       ├── application/
│       │   ├── ports/
│       │   │   └── message-publisher.ts
│       │   └── use-cases/
│       │       └── request-notification.ts
│       ├── domain/
│       │   └── notification.ts
│       └── infrastructure/
│           ├── messaging/
│           │   ├── bullmq-message-publisher.ts
│           │   └── service-bus-message-publisher.ts
│           └── consumers/
│               └── notification-consumer.ts
├── shared/
│   └── messaging/
│       ├── message-envelope.ts
│       └── message-registry.ts
└── bootstrap/
    └── messaging.ts
```

This is an illustrative structure rather than a mandatory folder convention.

The application layer owns the port it needs. Infrastructure adapters implement that port. The bootstrap layer selects and configures the implementation.

For example, dependency injection can bind the application interface to a BullMQ-backed implementation in one deployment and an Azure Service Bus-backed implementation in another.

The consumer's business handler can remain independent of the transport, while a provider-specific consumer adapter handles delivery, settlement, retries, and error translation.

Message schemas should also be validated at the system boundary. TypeScript types disappear at runtime, and a message may have been produced by an older application version or another service.

A typed interface alone is not sufficient to guarantee that a received message has a valid payload.

## Testing the boundary

A messaging abstraction also makes application services easier to test.

A unit test can replace the real message publisher with a fake implementation that records published messages.

The test can then verify that the application requests the expected operation without requiring Redis, Azure credentials, or a running worker.

Separate integration tests should verify that each adapter correctly maps application contracts to provider behavior.

For example, adapter tests can cover:

- Successful publication.
- Transient infrastructure failures.
- Invalid or incompatible messages.
- Retry and dead-letter behavior.
- Duplicate delivery.
- Serialization and schema validation.
- Connection loss and recovery.

The goal is to test both the application-level intent and the infrastructure-level guarantees.

A passing unit test does not prove that a queue configuration is reliable in production. Likewise, an integration test against one provider does not establish that another provider has identical semantics.

## Final thought

The goal is not to create a generic "queue wrapper."

The goal is to create a meaningful application-level messaging boundary while keeping infrastructure replaceable.

That boundary should protect business logic from provider-specific APIs without hiding the operational realities of asynchronous processing.

Retries still require careful policies. Consumers still need idempotency. Critical database changes may require an outbox. Delivery guarantees must be understood rather than assumed.

A well-designed abstraction does not make these problems disappear.

It gives the application a clear place to define its requirements and gives the infrastructure a clear responsibility for implementing them.

That is the difference between simply hiding a queue client behind an interface and designing a backend that can evolve its messaging infrastructure without unnecessarily rewriting its business logic.
