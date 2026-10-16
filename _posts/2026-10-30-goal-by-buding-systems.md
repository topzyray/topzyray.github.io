---
title: "What I Am Learning by Building These Systems"
date: 2026-10-30 06:00:00 +0100
description: "Reflection on lessons from building backend systems, from architecture and replaceable infrastructure to security, failure, and runtime fundamentals."
categories:
  - Engineering
  - Career
tags:
  - software-engineering
  - backend
  - nodejs
  - typescript
  - architecture
---

Over the past few weeks, I have been thinking more deeply about backend engineering.

What started as individual implementation tasks increasingly connects into a larger picture.

The common theme is not a particular framework.

It is system design.

The more I work through real engineering problems, the more I realize that writing code is only one part of building software. The decisions surrounding that code—how responsibilities are separated, how data moves through the system, how failures are handled, and how correctness is maintained—often determine whether an application remains manageable as it grows.

These are the lessons I have been exploring through the systems I build and the technical topics I continue to study.

## From endpoints to systems

It is easy to think about backend development as:

```text
Request
   ↓
Controller
   ↓
Service
   ↓
Database
```

That model is useful for learning.

It provides a simple way to understand how a request moves through an application and how responsibilities can be separated into layers.

Production systems require more.

We need to think about:

- identity;
- authorization;
- organizational boundaries;
- transactions;
- messaging;
- caching;
- auditing;
- failure;
- testing;
- observability;
- performance.

These concerns do not exist independently.

A database transaction may need to coordinate with an asynchronous event. An authorization decision may depend on the user's organizational context. A caching strategy may introduce consistency problems. A failed network request may leave the application uncertain about whether an operation completed.

Solving each problem in isolation is not enough. We need to understand how the decisions interact.

That shift—from thinking primarily about individual endpoints to understanding the system around them—is becoming increasingly important in how I approach backend engineering.

## Architecture became more important

Working on systems such as the NIS Store MIS made this especially clear.

The system contains multiple business capabilities:

```text
IAM
Requisitions
Approvals
Inventory
Assets
Dispatch
Organizations
Notifications
Audits
```

Those boundaries are not merely folder structures.

They represent different business responsibilities.

Identity and access management determines who can perform an operation. Requisitions and approvals represent business workflows. Inventory and assets manage different aspects of organizational resources. Notifications communicate outcomes, while audit records preserve evidence of important actions.

These capabilities interact, but they should not become unnecessarily dependent on one another's internal implementation.

For example, an approval workflow may need to update a requisition, record an audit event, and initiate a notification. That does not mean the approval logic should contain every detail of database access, email delivery, and audit storage.

Clear boundaries make those responsibilities easier to understand, test, and change.

They also make complexity more manageable. A system can grow without requiring every engineer to understand every implementation detail before making a localized change.

I am learning that good architecture is not about creating the largest number of modules or abstractions.

It is about identifying boundaries that reflect real responsibilities and making the relationships between them explicit.

## Infrastructure should remain replaceable

Another recurring lesson has been avoiding unnecessary infrastructure coupling.

A business operation should not become inseparable from:

```text
PostgreSQL
Redis
BullMQ
Email Provider
Object Storage
```

The infrastructure can change.

The business requirement should remain understandable.

For example, an application may initially use Redis and BullMQ for background processing, then adopt a managed messaging service as its operational requirements change.

If business logic is tightly coupled to a specific queue implementation, that change can spread across the application. If the application depends on a clearly defined messaging capability, the provider-specific implementation can remain behind an infrastructure boundary.

The same principle applies to email delivery, file storage, and persistence.

However, replaceability should not become abstraction for its own sake. Different providers have different delivery guarantees, retry behavior, transaction capabilities, and operational characteristics.

An abstraction that hides these differences can create a false sense of portability.

The objective is to isolate infrastructure details where that isolation provides real value while keeping important technical guarantees visible.

I want the business logic to express what the system needs to accomplish without being unnecessarily tied to how a particular provider accomplishes it.

## Security is part of architecture

Authentication and authorization cannot simply be added after the application is built.

Identity, sessions, roles, organizational scope and auditability influence the architecture from the beginning.

For example, identifying a user is not the same as determining what that user can do. A role may have different permissions in different organizational contexts. A valid identity may be permitted to view one resource but not another.

These distinctions influence the data model, API design, authorization policies, and testing strategy.

The same applies to auditability. If a system must explain who performed an action, when it happened, and what changed, those requirements should influence how operations and audit records are designed.

Security is not a separate layer that can compensate for every architectural weakness.

It is a property that needs to be supported by the system's boundaries, data access patterns, and business workflows.

## Failure is part of normal operation

Imports can fail.

Networks can fail.

Queues can fail.

External providers can fail.

Database operations can fail.

A production engineer needs to design for those situations instead of treating them as impossible scenarios.

One important lesson is that a failed request does not always mean the underlying operation failed.

A network timeout, for example, may occur after a remote service has completed the requested operation. Retrying without considering idempotency can duplicate its effects.

Similarly, a long-running import should not necessarily become unrecoverable because one batch failed. Durable progress, clear failure records, and safe retry mechanisms can make it possible to resume the work without repeating completed operations incorrectly.

This changes how I think about reliability.

Catching an exception is not the same as recovering from a failure. A system needs to know what happened, what state it is in, and which recovery actions are safe.

The goal is not to eliminate every possible failure.

It is to make failures detectable, bounded, and recoverable without compromising business correctness.

## I am also going deeper into Node.js

Framework knowledge remains useful.

But I am increasingly interested in understanding the runtime underneath:

- asynchronous execution;
- event-loop behavior;
- streams;
- networking;
- memory;
- performance;
- concurrency;
- failure behavior.

The goal is to understand not just how to use Node.js, but why a Node.js system behaves the way it does.

Understanding asynchronous execution, for example, helps explain why CPU-intensive JavaScript can delay unrelated requests even when the application uses promises extensively.

Understanding streams and backpressure helps explain how to process large amounts of data without loading everything into memory.

Understanding connection pools and network behavior helps explain why an application can become slow even when its own business logic appears simple.

These details become particularly important when investigating production problems. Instead of immediately reaching for another library or scaling the infrastructure, I want to be able to form a hypothesis about the underlying behavior, investigate it, and verify the result.

That requires more than familiarity with a framework's API.

It requires understanding the runtime and the systems around it.

## The bigger lesson

The more I build, the more I realize that senior engineering is not simply about writing more code.

It is about making better decisions.

Which boundary should exist?

Which dependency should be isolated?

Which data belongs where?

What happens when this operation fails?

How do we know the system is correct?

How do we measure it?

How will another engineer understand it six months from now?

These questions increasingly shape how I approach software development.

They also change how I evaluate technical decisions.

A solution is not automatically good because it uses a popular framework, introduces a sophisticated pattern, or reduces the number of lines of code. It needs to solve the actual problem, respect the system's constraints, and remain understandable to the people who will maintain it.

Sometimes that means introducing a stronger boundary. Sometimes it means choosing a simpler implementation and postponing an abstraction until the need becomes clear.

The important part is understanding the trade-offs rather than following a pattern without considering its purpose.

I am also learning that engineering quality cannot be judged only by whether a feature works today. We need to consider how it behaves under load, how it recovers from failure, how its correctness can be tested, and how safely it can evolve.

That is a broader responsibility than implementation alone.

## What comes next

I do not consider this journey finished.

There is still much more to explore:

- Node.js internals;
- distributed systems;
- database internals;
- messaging;
- observability;
- performance engineering;
- security;
- testing;
- cloud architecture.

Each of these areas introduces questions that connect to the others.

Database transactions influence how we publish events. Messaging guarantees influence how we design retries. Observability influences how quickly we can diagnose failures. Performance measurements influence whether an optimization is justified. Security requirements influence how we define system boundaries.

The deeper I go into one area, the more clearly I see its relationship with the rest of the system.

But the direction is becoming clearer.

I want to build systems that are not merely functional.

I want to understand why they work, how they fail, and how they can evolve.

I also want to keep documenting what I learn—not as a claim that the learning process is complete, but as a way to make the reasoning behind engineering decisions more explicit.

That is the engineering journey I intend to continue documenting here.
