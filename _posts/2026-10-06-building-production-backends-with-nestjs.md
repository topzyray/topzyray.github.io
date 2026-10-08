---
title: "Building Production Backends with NestJS"
date: 2026-10-06 09:00:00 +0100
categories:
  - Backend
  - Architecture
tags:
  - typescript
  - nodejs
  - nestjs
  - architecture
---

My focus for this month of October will be on NestJS framework and how it has imparted my development experience as a fullstack software engineer. NestJS provides a structured framework for building Node.js applications, but the framework alone does not determine whether an application will be maintainable in production.

The architecture surrounding the framework matters a lot. I will be sharing overview on my opinions when developing a secure and scalable systems in NestJS.

## Feature-oriented modules

I prefer organizing backend systems around business capabilities rather than technical file types.

For example:

```text
src/
├── modules/
│   ├── users/
│   ├── authentication/
│   ├── payments/
│   └── notifications/
│
├── infrastructure/
├── shared/
└── main.ts
```

This keeps related business functionality together.

## Dependency boundaries

Business logic should not directly depend on infrastructure details.

For example, application code should depend on an abstraction:

```bash
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
```

rather than directly depending on a specific provider.

The infrastructure layer can then implement it:

```bash
export class ResendEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    // provider implementation
  }
}
```

This makes it possible to replace infrastructure without rewriting business logic.

## The goal

The goal is not to create the largest possible architecture.

The goal is to create a system where important decisions remain easy to change.

That principle becomes increasingly important as an application grows.
