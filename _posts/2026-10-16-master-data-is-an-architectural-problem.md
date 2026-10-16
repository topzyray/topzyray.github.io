---
title: "Master Data Is an Architectural Problem"
date: 2026-10-16 06:00:00 +0100
description: "Explore why shared master data needs stable identifiers, clear ownership, and reliable synchronization to keep enterprise systems consistent."
categories:
  - Backend Engineering
  - Data Architecture
tags:
  - typescript
  - postgresql
  - master-data
  - enterprise-systems
  - architecture
---

One of the less glamorous parts of backend engineering is master data.

It is also one of the parts that can quietly determine whether the rest of an enterprise system remains consistent.

Master data rarely attracts the same attention as authentication, APIs, background jobs, or performance optimization. Yet when multiple modules and applications depend on the same real-world entities, the quality of that data influences how reliably the entire system operates.

## What is master data?

Master data represents relatively stable business entities that many parts of an organization depend upon.

Examples include organizational offices, personnel, departments, products, locations, and other entities that need to be identified consistently across business processes.

In the systems I have been working on, organizational information is a good example.

Instead of allowing every application or module to maintain its own interpretation of:

```text
State Offices
Zonal Headquarters
Offices
Directorates
Sections
Units
```

we can establish a reusable organizational registry.

Such a registry provides a consistent representation of organizational entities, their identifiers, and their relationships. Other parts of the system can then reference those records instead of creating independent versions of the same information.

The important distinction is that master data is not simply a collection of lookup values. It represents real business entities whose identities and relationships matter across multiple workflows.

## Why duplication becomes dangerous

Suppose one application calls an office:

```text
Lagos State Office
```

while another stores:

```text
LASO
```

and another uses a different identifier for the same office.

At first, this may appear to be a minor naming inconsistency.

The problem becomes more serious when the applications need to exchange information or combine their records.

Does `LASO` refer to the same office as `Lagos State Office`? Is the other identifier an alias, an outdated code, or a completely different entity?

Without a reliable way to resolve those questions, the system may treat the same office as multiple entities or incorrectly associate records with the wrong one.

The consequences can affect:

- **Authorization:** Users may receive access based on inconsistent office references.
- **Reporting:** Records for the same office may be split across different reports.
- **Workflows:** Approval routing may fail or direct requests to the wrong office.
- **Personnel assignments:** Staff records may become associated with duplicate or outdated organizational entries.
- **Inventory ownership:** Assets and stock may appear to belong to different offices when they should be associated with the same entity.
- **Audit records:** Historical events may become difficult to interpret when organizational references are inconsistent.

The problem is not simply inconsistent naming.

It is the absence of a dependable identity for an entity that multiple parts of the organization need to recognize.

## Stable identifiers matter

This is why I have been working with stable office codes and explicit relationships between organizational records.

A code can provide a stable reference while the display name changes.

Conceptually:

```text
code: LASO
name: Lagos State Office
```

Other systems can refer to `LASO` without depending on a display string that may change because of renaming, formatting, or administrative updates.

In a relational database such as PostgreSQL, an organizational record might have an internal primary key and a separate, unique business code:

```ts
type Office = {
  id: string;
  code: string;
  name: string;
  parentOfficeId: string | null;
};
```

Here, `id` identifies the database entity, `code` provides a recognizable organizational reference, and `parentOfficeId` represents its position in the hierarchy.

These fields serve different purposes.

A display name should not be treated as a stable identifier. Even a business code needs a defined lifecycle: if codes can change, the system must decide how those changes are handled and how existing references remain valid.

Depending on the system, that may mean preserving the internal identifier, maintaining code history or aliases, and ensuring that code changes do not silently break integrations.

Database constraints also matter. A unique constraint on the appropriate code scope helps prevent duplicate identifiers, while foreign keys can ensure that dependent records reference existing organizational entities.

The exact constraints depend on whether codes are globally unique or unique only within a particular organization or jurisdiction.

The principle is straightforward: identity should be explicit, stable, and enforced rather than inferred from a name.

## Master data should be reusable

The organizational registry should not exist only for one screen.

It can support:

- Store management.
- Personnel systems.
- Asset management.
- Reporting.
- Authorization.
- Office accounts.
- Requisition and approval workflows.

For example, a store management module should not need to maintain its own independent list of offices if those offices already exist in the organizational registry.

It should reference the appropriate organizational records and apply its own business rules to them.

A personnel module may need to know where an officer is posted. An asset management module may need to know which office is responsible for an asset. An approval workflow may need to determine which organizational authority should review a request.

Each module has different responsibilities, but they can share a consistent understanding of the office involved.

This does not mean every module must use the same database table directly or that every application must share one database.

A modular monolith may reference master data through a shared domain boundary and database constraints. Independently deployed services may expose a dedicated API, publish change events, or maintain controlled local copies.

The appropriate approach depends on the system's architecture and operational requirements.

What matters is that the identity and meaning of shared entities remain consistent, even when their data is accessed or replicated through different mechanisms.

## Ownership and change management matter

A reusable registry is only useful if the organization defines who is allowed to maintain it and how changes are handled.

Consider an office that is renamed, deactivated, or moved under a different parent office.

Those changes may affect personnel assignments, approval routes, inventory records, reports, and other dependent workflows.

The system therefore needs clear rules for creating and updating master records, validating organizational relationships, and handling changes that affect existing references.

For example:

- Who is authorized to create a new office?
- Which fields can be changed, and by whom?
- What happens to existing records when an office becomes inactive?
- How are dependent systems informed when an office changes?
- Should historical records retain the organizational context that existed when an event occurred?

Not every system needs a complex master data management platform. However, systems with many dependent modules benefit from explicit ownership, validation, and change-management rules.

There is also a distinction between sharing master data and allowing every consumer to modify it. A module that uses organizational records should not automatically have permission to redefine them.

Clear ownership prevents different parts of the system from becoming competing authorities for the same business information.

## Master data and synchronization

When multiple applications consume the same master data, consistency becomes a synchronization concern as well as a modeling concern.

If one application owns the authoritative organizational registry, other applications need a defined way to receive updates.

Depending on the architecture, this might involve direct reads, API calls, scheduled synchronization, or events published when records change.

Each approach introduces trade-offs.

Direct reads can provide current data but create runtime dependencies. Local copies can improve availability and reduce network traffic, but they may become temporarily stale. Event-driven synchronization can distribute changes efficiently, but consumers need to handle duplicate events, retries, ordering concerns, and missed updates.

A shared registry therefore does not automatically guarantee that every system sees every change immediately.

The architecture should define which system owns the data, how changes are propagated, how stale records are detected, and how consumers recover when synchronization fails.

This becomes especially important when master data influences authorization or other security-sensitive decisions. A stale organizational reference should not silently grant access that the current policy would deny.

## Final thought

Master data is easy to underestimate because it does not look like an exciting feature.

But when multiple systems depend on the same real-world entities, consistency becomes infrastructure.

Stable identifiers help preserve identity. Explicit relationships make organizational structures understandable. Clear ownership and controlled synchronization keep shared records reliable as the organization changes.

Good master data design reduces duplication and gives the rest of the system something stable to build upon.
