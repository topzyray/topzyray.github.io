---
title: "Master Data Is an Architectural Problem"
date: 2026-10-16 08:00:00 +0100
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

## What is master data?

Master data represents relatively stable entities that many parts of the organization depend upon.

In the systems I have been working on, organizational information is a good example.

Instead of allowing every application to maintain its own interpretation of:

```text
State Offices
Zonal Headquarters
Offices
Directorate
Section
Unit
```

we can establish a reusable organizational registry.

## Why duplication becomes dangerous

Suppose one application calls an office:

```text
Lagos State Office
```

while another stores:

```text
LASO
```

and another uses a different identifier.

The problem is not simply inconsistent naming.

It affects:

- authorization;
- reporting;
- workflows;
- personnel assignments;
- inventory ownership;
- audit records.

## Stable identifiers matter

This is why I have been working with stable office codes and explicit relationships between organizational records.

A code can provide a stable reference while the display name can change.

Conceptually:

```text
code: LASO
name: Lagos State Office
```

Other systems can refer to `LASO` without depending on a display string.

## Master data should be reusable

The organizational registry should not exist only for one screen.

It can support:

- store management;
- personnel systems;
- asset management;
- reporting;
- authorization;
- office accounts.

This is where master data becomes an architectural concern.

## Final thought

Master data is easy to underestimate because it does not look like an exciting feature.

But when multiple systems depend on the same real-world entities, consistency becomes infrastructure.

Good master data design reduces duplication and gives the rest of the system something stable to build upon.
