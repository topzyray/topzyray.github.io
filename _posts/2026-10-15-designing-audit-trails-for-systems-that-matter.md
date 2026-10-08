---
title: "Designing Audit Trails for Systems That Matter"
date: 2026-10-15 08:00:00 +0100
categories:
  - Backend Engineering
  - Enterprise Systems
tags:
  - audit
  - security
  - compliance
  - nodejs
  - nestjs
---

An audit log is not simply a table containing timestamps.

In systems involving inventory, approvals, assets and organizational responsibilities, knowing that something happened is not enough.

We also need to know what happened and who initiated it.

## Auditability changes how a system is designed

Consider a requisition.

A useful audit trail may need to answer:

```text
Who?
What?
When?
Which resource?
Which action?
What changed?
```

That is fundamentally different from simply logging:

```text
Request completed successfully.
```

## Audit and application logs are different

Application logs help us as engineers understand system behavior.

Audit records serve a different purpose.

For example:

```text
Application log:
Database connection failed.

Audit record:
User approved requisition X.
```

The first helps operate the system.

The second records a business action.

## Audit sensitive workflows

The NIS Store MIS contains workflows involving:

- requisitions;
- approvals;
- inventory;
- assets;
- dispatch.

These are precisely the kinds of operations where traceability becomes important.

## Do not record meaningless noise

Auditing everything can produce an enormous amount of information without creating useful accountability.

The better question is:

> Which business actions must remain traceable?

Examples include:

- creation;
- approval;
- rejection;
- dispatch;
- assignment;
- status changes;
- sensitive administrative changes.

## Audit records should be difficult to misinterpret

An audit record should provide enough context to understand the action without requiring the reader to reconstruct the entire request from unrelated application logs.

This is especially important when an organization needs to investigate what happened later.

## Validate audits records before persistence

It is germane to mention this because paying attention to details ensure systems are safer from attackers.

I mean Audit Input Validation (AIV).

Validating audits input before persisting in the database can help reduce attack vectors on core infrastructure especially the DATABASE.

## Final thought

Auditability is not something that should be bolted onto an enterprise system at the end.

It should be considered when designing important business workflows.

If an operation matters to the organization, the system should make its history understandable.
