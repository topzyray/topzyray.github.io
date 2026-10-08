---
title: "Designing Authentication as a System, Not a Login Endpoint"
date: 2026-10-11 08:00:00 +0100
categories:
  - Backend Engineering
  - Security
tags:
  - authentication
  - jwt
  - nodejs
  - typescript
  - security
---

Authentication is often introduced as a login endpoint.

> A user submits credentials.

> The server verifies them.

> The server returns a token.

#### "That is only the beginning."

When designing authentication for real applications, several other questions appear:

- How are email addresses verified?
- How are passwords reset?
- How are sessions revoked?
- How do web and mobile clients differ?
- How are multiple devices handled?
- What happens when a token is compromised?
- How is multi-factor authentication enforced?

These questions are what turn authentication into a system.

## Authentication is more than credentials

A complete identity workflow can include:

```text
Registration
    │
    ▼
Email Verification
    │
    ▼
Authentication
    │
    ▼
Session
    │
    ├── Refresh
    ├── Revoke
    └── Logout
```

Password reset and account recovery are additional flows.

Each one has security implications.

## Web and mobile clients are different

One authentication decision I have worked through is separating web and mobile token delivery.

For web applications, HTTP-only cookies provide a useful mechanism for keeping tokens away from normal JavaScript access.

For mobile applications, returning tokens to the client may be appropriate because the client has a different security model.

The important point is not that one method is universally superior.

It is that the authentication design should account for the client.

## Email verification

A registration system should not simply assume that an email address has been verified.

A verification workflow needs:

```text
User
 │
 ▼
Verification Request
 │
 ▼
Single-use Token
 │
 ▼
Verification
 │
 ▼
Verified Identity
```

Tokens should not simply be stored as reusable plaintext credentials.

A secure design should consider:

- expiration;
- single-use behavior;
- hashing;
- replay protection;
- appropriate response behavior.

## Password reset

Password reset deserves the same level of attention.

The system should not reveal whether an account exists through unnecessarily different responses.

A reset token should have:

- a limited lifetime;
- single-use semantics;
- secure storage;
- a clear invalidation strategy.

## Authentication is a boundary

Once authentication succeeds, the application knows who is making the request.

It still does not know whether that person is allowed to perform the operation.

That takes us to authorization.

Authentication answers:

> Who are you?

Authorization answers:

> What are you allowed to do?

That distinction becomes particularly important in enterprise applications.

## Final thought

The more I work on backend systems, the less I think of authentication as a single endpoint.

It is a collection of security workflows surrounding identity.

Designing those workflows explicitly makes the system easier to reason about, test and secure.
