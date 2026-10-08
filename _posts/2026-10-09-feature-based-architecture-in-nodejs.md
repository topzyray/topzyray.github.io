---
title: "Feature-Based Architecture in Node.js"
date: 2026-10-09 08:00:00 +0100
categories:
  - Backend Engineering
  - Architecture
tags:
  - nodejs
  - typescript
  - express
  - nestjs
  - architecture
---

In my previous posts, I discussed why architecture should be more important than the framework and why infrastructure should not control business logic.

The next question is practical:

**How should the codebase itself be organized?**

For the systems I have been working on, I increasingly prefer organizing code around business capabilities rather than putting every controller, service, repository and model into global folders.

This is what I mean by feature-based architecture.

## The traditional structure

A common Node.js project starts like this:

```text
src/
├── controllers/
├── services/
├── repositories/
├── models/
├── validators/
└── utils/
```

This works for small applications.

As the application grows, however, finding everything related to one business capability becomes harder.

A user-related change may involve:

```text
controllers/UserController.ts
services/UserService.ts
repositories/UserRepository.ts
models/User.ts
validators/UserValidator.ts
```

The files are separated by technical role rather than business responsibility.

## Organizing around features

An alternative is:

```text
src/
├── modules/
│   ├── users/
│   ├── posts/
│   ├── orders/
│   └── notifications/
```

Each feature can contain its own:

```text
domain/
application/
infrastructure/
presentation/
```

This is particularly useful for larger systems.

In the NIS Store MIS work, for instance, the system has distinct business areas such as:

- identity and access management;
- requisitions;
- approvals;
- assets;
- inventory;
- dispatch;
- organizations;
- notifications;
- auditing.

These are not merely technical categories.

They represent different areas of the business.

## A feature is a boundary

A useful feature boundary answers:

> What business capability does this module own?

For example:

```text
requisitions/
├── domain/
├── application/
├── infrastructure/
└── presentation/
```

The requisition module should own requisition-specific behavior.

The approval module should own approval-specific behavior.

This makes the architecture easier to reason about.

## Feature-based does not mean abandoning layers

Feature-based architecture and layered architecture are not opposites.

They can work together.

For example:

```text
modules/
└── requisitions/
    ├── domain/
    ├── application/
    ├── infrastructure/
    └── presentation/
```

The feature provides the boundary.

The internal layers provide separation of responsibilities.

This combination is more useful to me than choosing one pattern dogmatically.

## Why this matters

As systems grow, organization becomes part of architecture.

A codebase should make it obvious:

- where a business rule lives;
- which module owns it;
- which infrastructure implements it;
- where its HTTP interface is exposed;
- how it can be tested.

Good folder structure cannot fix bad architecture.

But good boundaries make bad coupling easier to detect.

## Final thought

The purpose of feature-based architecture is not to make the folder tree look sophisticated.

It is to make the business structure visible in the code.

When I open a production backend, I want to understand the system by understanding its capabilities.

That is the direction I am increasingly taking with my Node.js architecture.
