---
title: "What Building Production Backends Taught Me About Architecture"
date: 2026-10-07 08:00:00 +0100
categories:
  - Backend Engineering
  - Architecture
tags:
  - nodejs
  - typescript
  - nestjs
  - architecture
  - clean architecture
  - domain driven design
---

In my previous post, I wrote about building production backends with NestJS.

The more I work on real systems, the more I realize that the framework is only one part of the engineering problem.

The harder problem is deciding **how the system should be structured so that it remains understandable and changeable as it grows**.

That lesson has become particularly clear while working on the Nigeria Immigration Service Store Management Information System and while designing other Node.js backend systems.

## The application is larger than its HTTP API

It is easy to start a backend with a few endpoints:

```text
Request
   ↓
Controller
   ↓
Service
   ↓
Database
```

This can work well for a small application.

But the systems I have been working on involve considerably more than CRUD endpoints.

The NIS Store MIS, for example, has business areas including:

- identity and access management;
- requisitions;
- approvals;
- inventory;
- assets;
- dispatch;
- organizations;
- notifications;
- auditing.

Each of these areas has its own rules and responsibilities.

At that point, simply adding more controllers and services is not enough.

The architecture needs to reflect the business.

## Business capabilities should have boundaries

One of the architectural directions I have been using is to think in terms of business capabilities.

Conceptually:

```text
Application
│
├── IAM
├── Requisitions
├── Approvals
├── Inventory
├── Assets
├── Dispatch
├── Organizations
├── Notifications
└── Auditing
```

These are not just folders.

They represent different responsibilities within the system.

For example, requisitions have their own lifecycle.

Approvals have their own rules.

Inventory has its own state and operations.

Auditing has a different responsibility entirely.

Giving these areas clear boundaries makes the system easier to reason about.

## The framework should not own the business rules

NestJS provides useful mechanisms for building applications:

- modules;
- controllers;
- dependency injection;
- guards;
- pipes;
- interceptors.

These are valuable.

But the business rules should not exist simply because NestJS provides a particular mechanism for expressing them.

For example, the rule:

> A requisition must pass through the appropriate approval process before it can proceed.

is a business rule.

It should remain meaningful even if the HTTP framework changes.

That distinction is important.

## I started thinking in layers

The architectural model I increasingly use separates responsibilities roughly like this:

```text
Presentation
     │
     ▼
Application
     │
     ▼
Domain
     │
     ▼
Infrastructure
```

Each layer has a different responsibility.

### Presentation

This is where external requests enter the system.

For example:

- HTTP controllers;
- request validation;
- response mapping.

### Application

This layer coordinates use cases.

For example:

```text
Create Requisition
Review Requisition
Approve Requisition
Dispatch Items
Register User
Verify Email
etc...
```

### Domain

This is where important business concepts and rules live.

The domain should not need to know whether the application uses NestJS, Express, PostgreSQL or another infrastructure technology.

### Infrastructure

This is where technical implementations live.

Examples include:

- PostgreSQL;
- Prisma;
- Redis;
- queues;
- email providers;
- file storage;
- external APIs.

## Why this separation matters

The purpose is not to create more folders.

The purpose is to control dependencies.

Let us consider this simplified dependency:

```text
Business Logic
      │
      ▼
PostgreSQL
```

The business logic now knows about a specific infrastructure technology.

A more flexible design is:

```text
Business Logic
      │
      ▼
Repository Interface
      ▲
      │
PostgreSQL Implementation
```

The business logic depends on what it needs rather than on the technology providing it.

This becomes particularly useful when infrastructure decisions change tomorrow.

## Real systems contain multiple boundaries

Another lesson from the systems I have been working on is that there is rarely only one boundary.

There are several.

For example:

```text
Identity
   │
   ▼
Authorization
   │
   ▼
Business Operation
   │
   ▼
Persistence
   │
   ▼
Events / Notifications
```

Each boundary can introduce its own failure modes and architectural concerns.

Authentication is not authorization.

Authorization is not business logic.

Business logic is not persistence.

Persistence is not messaging.

Keeping these distinctions clear helps prevent one component from becoming responsible for everything.

## Architecture also affects security

Security cannot simply be added after the application has been designed.

Consider the identity model.

A user may have:

- an identity;
- one or more sessions;
- a role;
- an office;
- organizational scope.

That means authorization may require more information than a simple role check.

This becomes particularly important in enterprise systems where organizational relationships influence what a user can access.

Architecture therefore needs to accommodate security boundaries from the beginning.

## Architecture also affects data

The organizational data work I have been doing provided another example.

A real organization may contain:

```text
Headquarters
    │
    ├── Directorates
    │      └── Sections / Units
    │
    ├── Zones
    │      └── State Commands
    │             └── Operational Offices
    │
    └── Other organizational structures
```

Representing this accurately requires more than storing a name.

The system needs to distinguish concepts such as:

- office type;
- hierarchy level;
- domain;
- jurisdiction;
- status;
- parent organization.

This is domain modeling.

The database schema follows from those decisions.

## Complexity should be introduced deliberately

There is also a danger in architecture discussions.

Once we discover Clean Architecture, Domain-Driven Design, dependency inversion and similar ideas, it can be tempting to apply every pattern everywhere.

I do not think that is the goal here.

A small application does not need the architecture of a large enterprise platform.

The architecture should be proportional to the problem.

The important question is:

> What complexity does this system actually need me to manage?

## What I am taking away

My biggest lesson so far is that production backend engineering is less about choosing the perfect framework and more about making good boundaries.

I want to know:

- Which module owns this rule?
- Which layer should make this decision?
- Which dependency can change?
- Which data belongs to which domain?
- Which operations need auditing?
- Which operations can fail?
- Which external systems should the business logic know about?

Those questions are becoming more important to me than simply getting an endpoint to return a successful response.

## Final thought

I still use frameworks.

I still care about databases, queues, caches, APIs and cloud infrastructure.

But I increasingly see these as implementation decisions around a deeper structure.

The goal is not to build an application that works only with today's technology.

The goal is to build an application whose **business logic remains understandable when the technology around it changes**.

That is the architectural direction I am continuing to explore.
