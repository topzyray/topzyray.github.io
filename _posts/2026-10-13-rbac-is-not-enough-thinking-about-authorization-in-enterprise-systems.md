---
title: "RBAC Is Not Enough: Thinking About Authorization in Enterprise Systems"
date: 2026-10-13 08:00:00 +0100
categories:
  - Backend Engineering
  - Security
tags:
  - rbac
  - authorization
  - nestjs
  - nodejs
  - enterprise systems
---

Roles are one of the first authorization mechanisms most backend developers encounter.

For example:

```text
admin
manager
user
```

The server checks the user's role and allows or rejects an operation.

That is useful.

But enterprise systems quickly demonstrate that roles alone are often insufficient.

## The NIS Store MIS example

The system I have been working on above includes roles representing different responsibilities.

These include:

- system administrator;
- operational administrator;
- store administrator;
- multi-layered approving authority
- store manager;
- store officer;
- department officer;
- request officer;
- dispatch officer;
- auditor.

The important observation is that a person's role does not necessarily tell us everything about what they can access.

## Role versus context

Consider two users with the same role.

They may still belong to different offices.

Therefore:

```text
Same role
+
Different office
=
Potentially different access
```

This is where authorization becomes contextual.

## RBAC

Role-Based Access Control answers questions such as:

> Does this user have the `store_manager` role?

That is useful for coarse-grained authorization.

For example:

```text
store_manager → approve requisition
```

But the system may also need to ask (which it actually does):

> Is this requisition within the organizational scope this user is allowed to manage? (since it is a multi-tenant system)

That is no longer just role checking.

## Authorization should be explicit

A useful authorization decision can be thought of as:

```text
Identity
   +
Role
   +
Resource
   +
Action
   +
Context
   =
Authorization Decision
```

This gives us a more realistic model.

## Avoid scattering authorization

One of the problems with poorly designed systems is authorization logic appearing everywhere:

```ts
if (user.role === "admin") ...
```

inside controllers, services and repositories.

That becomes difficult to audit.

Authorization should instead have recognizable policy boundaries.

## Final thought

RBAC remains valuable.

The lesson is not to abandon it.

The lesson is to recognize when the system has moved beyond simple role-based decisions.

Enterprise authorization often needs identity, role, resource and organizational context to make a correct decision.
