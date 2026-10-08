---
title: "From RBAC to ABAC: Authorization Around Offices and Jurisdictions"
date: 2026-10-14 08:00:00 +0100
categories:
  - Backend Engineering
  - Security
tags:
  - abac
  - rbac
  - authorization
  - enterprise architecture
  - nodejs
---

Yesterday I discussed why role-based authorization can become insufficient in enterprise applications.

The next step is understanding contextual authorization.

This is where Attribute-Based Access Control becomes useful.

## What is ABAC?

Instead of asking only:

```text
Does the user have role X?
```

ABAC can consider attributes of:

- the user;
- the resource;
- the action;
- the environment.

For example:

```text
User role
+
User office
+
Resource office
+
Requested action
=
Decision
```

## Why organizational systems need this

The NIS-related systems I have been designing contain organizational structures such as:

- headquarters;
- directorates;
- sections and units;
- zones;
- state commands;
- border-related offices;
- training institutions;
- foreign missions.

A user can therefore have a role and still need to be restricted by organizational scope.

## Model the organization explicitly

One lesson from working on the organizational registry is that organizational relationships should be represented as data.

For example:

```text
Headquarters
   │
   ├── Directorate
   │      └── Section
   │
   └── Zone
          └── State Command
                 └── Local Government Office
```

The authorization layer can then reason about that structure.

## Do not confuse organizational hierarchy with authorization

An organizational hierarchy tells us how offices relate.

It does not automatically tell us what every person in those offices may do.

That distinction is important.

The hierarchy is data.

Authorization is policy.

The policy can use the hierarchy as one of its inputs.

## Geographical boundaries

The same thinking can apply to jurisdiction.

A user may have permission to perform an operation only within a particular organizational or geographical scope.

This is one reason I have been interested in ABAC and geofencing concepts for the system and every other system especially when privileged access is a deal.

## Final thought

RBAC answers an important question.

ABAC gives us a way to answer more contextual questions.

The key is not to replace one with the other blindly.

A production authorization system should use the simplest model capable of representing its actual rules.
