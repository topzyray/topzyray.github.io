---
title: "Modeling Real-World Organizations Without Polluting Your Domain Model"
date: 2026-10-17 06:00:00 +0100
description: "Model complex organizations by separating office type, hierarchy, status, jurisdiction, and operational classification into clear domain concepts."
categories:
  - Backend Engineering
  - Data Architecture
tags:
  - domain-modeling
  - typescript
  - nodejs
  - enterprise-systems
---

Real organizations rarely fit neatly into a simple tree.

That becomes obvious when you attempt to model a large institution.

There may be headquarters, directorates, zones, state offices, specialized offices, local offices, and other organizational units. Some offices have administrative responsibilities, others have operational responsibilities, and some may serve specific geographical areas or functions.

The challenge is not simply representing these offices in a database.

It is representing their relationships and differences accurately without making the domain model unnecessarily complicated.

## The first mistake: one field for everything

A model like this:

```ts
type Office = {
  name: string;
  type: string;
};
```

looks simple.

It also loses important information.

What does `type` mean?

Does it describe the kind of office, its position in the organizational hierarchy, its operational role, its geographical jurisdiction, or its physical classification?

Those concepts are related, but they are not interchangeable.

For example, a state command and a directorate may represent different organizational types. A headquarters office and a local office may occupy different levels of a hierarchy. An office may operate within a particular geographical jurisdiction, while an outpost may have a separate operational classification.

If all these distinctions are compressed into one field, the application eventually has to recover the missing meaning through naming conventions, conditional statements, or assumptions scattered across the codebase.

The model appears simple, but the complexity has not disappeared. It has merely moved somewhere less predictable.

## Separate concepts

The organizational modeling work I have been doing led to distinctions such as:

```text
OfficeType
OfficeLevel
OfficeStatus
OfficeDomain
OfficeJurisdiction
```

Each concept should answer a specific question.

- **Office type:** What kind of organizational unit is this?
- **Office level:** Where does it sit within the organizational structure?
- **Office status:** Is it active, inactive, or otherwise restricted from normal use?
- **Office domain:** What operational or administrative area does it belong to?
- **Office jurisdiction:** What geographical area, population, or set of responsibilities falls within its authority?

The exact definitions depend on the institution. These concepts should not become separate fields merely because they sound different; each should represent a distinction that the business actually needs to preserve.

For outposts, an additional classification such as:

```text
MEGA
MEDIUM
MINI
```

can represent an operational classification without pretending that it is the same thing as the office's organizational type.

For example, an outpost might belong to a particular office type, sit at a particular place in the hierarchy, and have a `MEDIUM` operational classification.

Those attributes can coexist because they answer different questions.

In TypeScript, the model might begin with explicit types:

```ts
type OfficeType =
  | "HEADQUARTERS"
  | "DIRECTORATE"
  | "ZONE"
  | "STATE_COMMAND"
  | "OUTPOST";

type OfficeStatus = "ACTIVE" | "INACTIVE";

type OutpostClassification = "MEGA" | "MEDIUM" | "MINI";

type Office = {
  id: string;
  code: string;
  name: string;
  type: OfficeType;
  status: OfficeStatus;
  parentOfficeId: string | null;
};
```

This is an illustrative starting point, not a complete organizational domain model. In a production system, additional concepts such as jurisdiction, operational domain, and hierarchy level should be introduced when their meanings and business rules are sufficiently clear.

There is also an important modeling decision here: not every office necessarily needs an outpost classification. If the classification only applies to outposts, it should be modeled in a way that prevents unrelated office types from acquiring meaningless values.

That may involve a dedicated outpost entity, a discriminated union, or another explicit domain structure, depending on the requirements.

The goal is not to create as many types as possible. It is to make invalid combinations harder to represent and valid combinations easier to understand.

## Why this matters

Consider:

```text
Office Type
    ≠
Office Level
    ≠
Operational Classification
```

Each answers a different question.

If we combine them into one enum, future changes become difficult.

Imagine that an institution introduces a new category of specialized office. If the application uses one field for both organizational type and operational classification, adding the new category may require changes to validation rules, reporting logic, permissions, and other parts of the application that were never intended to depend on that distinction.

Separating the concepts reduces this coupling.

It also makes queries and reports more meaningful. A report can group offices by organizational type without accidentally grouping them by operational classification. An authorization rule can depend on an office's actual responsibilities rather than inferring those responsibilities from a loosely defined string.

The same principle applies to status. An inactive office is not necessarily a different kind of office. Its identity and organizational role may remain meaningful even when it is no longer available for new assignments.

A well-defined model gives each business rule an explicit concept to depend on.

## Parent-child relationships

Organizational hierarchy can then be represented separately:

```text
Headquarters
 └── Zone
      └── State Command
           └── Local Area Office
                └── Outpost
```

The parent relationship expresses hierarchy.

The classification expresses something else.

A `parentOfficeId` field can represent this relationship in a relational database, allowing an office to reference its immediate parent without embedding the entire organizational path in its type.

However, a parent-child relationship alone does not enforce a valid hierarchy. The domain rules must determine which office types may contain which other types, whether an office can have no parent, and how changes to the hierarchy should be validated.

For example, a system may need to prevent an office from becoming its own ancestor, prohibit unsupported parent-child combinations, or ensure that moving an office does not invalidate existing assignments.

These rules should be enforced at the appropriate application and database boundaries rather than assumed from the shape of the data.

It is also worth distinguishing organizational hierarchy from other relationships.

An office's geographical jurisdiction may overlap with another office's jurisdiction. An office may report administratively to one unit while coordinating operationally with another. Those relationships do not necessarily belong in the same parent-child tree.

Trying to force every relationship into a single hierarchy can make the model inaccurate.

The structure should reflect the actual business relationships, even when that means representing some of them separately.

## Keep the domain model separate from presentation and infrastructure

Another consequence of this approach is that the domain model should not be designed solely around the database schema or the requirements of a particular user interface.

A database may use foreign keys and normalized tables to represent organizational relationships. An API may expose nested objects or flattened fields for convenient consumption. A frontend may display a breadcrumb such as:

```text
Headquarters / Zone / State Command / Outpost
```

These are different representations of the same underlying concepts.

The domain should define what the relationships mean and what rules govern them. The persistence layer should store those relationships reliably, while the API and frontend should present them in forms suitable for their respective responsibilities.

This separation makes it possible to change a database representation or improve a user interface without redefining the meaning of an office throughout the application.

It also discourages business rules from becoming scattered across database queries, controllers, and frontend conditionals.

## Organizational structures change

Real institutions are not static.

Offices may be created, renamed, merged, deactivated, or moved under different parent units. New operational classifications may be introduced, and geographical responsibilities may change.

These changes raise questions that a simple `name` and `type` model cannot answer reliably.

Should an office retain its identity when its name changes? What happens to its child offices when it is moved? Should historical records continue to reference the office as it existed when an event occurred? Does deactivating an office prevent new assignments while preserving existing records?

Not every application needs a full organizational history or effective-dated hierarchy. However, systems that support audits, personnel assignments, approvals, or historical reporting should consider these requirements early.

Stable office codes, explicit status transitions, controlled hierarchy changes, and historical records can help preserve consistency as the organization evolves.

The appropriate design depends on the business requirements, but these decisions are easier to make when the underlying concepts are not already entangled.

## Final thought

Good domain modeling often starts by resisting the temptation to simplify different concepts into one field.

Organizational type, hierarchy level, operational classification, status, and jurisdiction may be related, but their meanings are different.

Separating them makes business rules clearer, reduces accidental coupling, and gives the system room to evolve.

The real world may be complicated.

Our data model should be understandable, but it should not become inaccurate merely because simplicity is attractive.
