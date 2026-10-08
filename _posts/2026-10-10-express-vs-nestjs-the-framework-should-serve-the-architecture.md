---
title: "Express vs NestJS: The Framework Should Serve the Architecture"
date: 2026-10-10 08:00:00 +0100
categories:
  - Backend Engineering
  - Node.js
tags:
  - nodejs
  - express
  - nestjs
  - typescript
  - architecture
---

I have worked with Express.js application in the past when I was starting out. I have worked extensively with NestJS, and I have also spent time deliberately designing how I would structure a production Express.js backend having had much exposure to how things work in NestJS.

That comparison changed how I think about frameworks.

The important question is not:

> Which framework is better?

It is:

> Which framework fits the architecture and constraints of this particular system?

## NestJS gives you structure

NestJS provides strong conventions around:

- modules;
- dependency injection;
- controllers;
- providers;
- guards;
- pipes;
- interceptors;
- middleware.

That structure is useful for large TypeScript applications.

It also makes many architectural concepts explicit.

## Express gives you freedom

Express is intentionally much smaller.

That is both its strength and its weakness.

You can build almost any architecture with it.

But you must decide:

- how modules are organized;
- how dependencies are composed;
- where validation happens;
- how errors are handled;
- how infrastructure is injected;
- how application boundaries are enforced.

That freedom requires architectural discipline. I believe you will agree with me on this.

## Architecture should survive the framework

The most important lesson for me overtime is that the business architecture should not depend on whether the HTTP adapter is Express or NestJS.

Conceptually:

```text
HTTP
 │
 ├── Express
 │
 └── NestJS
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

The framework sits at the edge.

That means I can learn both frameworks without making either one the center of the system.

## When I would choose NestJS

NestJS is attractive when:

- the team benefits from strong conventions;
- dependency injection is useful;
- the application has many modules;
- the team wants a consistent application structure;
- TypeScript is central to the project.

This aligns well with the architecture of the NIS Store MIS, Uri and Inu.

## When I would choose Express

Express becomes attractive when:

- the application needs a lightweight HTTP layer;
- the team wants explicit architectural control;
- framework abstraction should remain minimal;
- the team already has strong architectural conventions.

The key is that Express should not mean putting everything into one enormous application file.

## The real engineering skill - The Real Deal

Knowing both frameworks is useful.

Understanding **what belongs to the framework and what does not** is more important.

A controller is framework-specific.

A business rule is not.

A NestJS provider is framework-specific.

A domain policy is not.

A Prisma adapter is infrastructure-specific.

A business requirement is not.

This distinction is becoming increasingly important in the way I design backend systems.

## My Final thought

I no longer see Express and NestJS primarily as competing technologies.

I see them as different ways of implementing the outer layer of a backend.

The architecture should determine how the framework is used—not the other way around.
