---
title: "Sessions, Devices and JWTs in a Multi-Client Application"
date: 2026-10-12 08:00:00 +0100
categories:
  - Backend Engineering
  - Security
tags:
  - jwt
  - sessions
  - authentication
  - mobile
  - web
---

JWT authentication is easy to demonstrate.

Production session management is harder.

A token can tell the server who a user is, but a production authentication system also needs to answer:

- Which device created the session?
- How many active sessions should a user have?
- Can one session be revoked?
- What happens after logout?
- How does a mobile application behave differently from a browser?
- How can suspicious sessions be identified?

These are session-management questions.

## Treat sessions as first-class data

Instead of thinking only about a JWT, I think about:

```text
User
 │
 ├── Session A
 ├── Session B
 └── Session C
```

A session can carry information such as:

- identity;
- device identifier;
- creation time;
- last activity;
- expiration;
- revocation state.

This creates a much more manageable model.

## Limiting sessions

One design I have worked with uses a maximum number of active sessions per identity.

The important principle is that session limits should be enforced deliberately rather than accidentally.

When a new session is created, the application can determine whether existing sessions must be invalidated.

## Device identity

For mobile applications, a device identifier can help distinguish sessions.

This does not make the device automatically trustworthy.

It simply gives the system another piece of information for session management.

The backend can then reason about:

```text
User
 ├── Device A
 ├── Device B
 └── Device C
```

## Revocation matters

A purely stateless JWT design can make immediate revocation difficult.

If the server issues a long-lived token and has no server-side session state, invalidating one token becomes harder.

This is why session design often combines:

- short-lived access credentials;
- refresh/session state;
- server-side revocation.

The exact implementation depends on the application's threat model.

## Mobile authentication

Mobile applications also introduce concerns such as:

- secure local storage;
- biometric authentication;
- token refresh;
- device lifecycle.

In the systems I have been designing, mobile authentication therefore cannot simply be treated as a browser authentication flow with a different UI.

## Final thought

JWTs are a mechanism.

Authentication architecture is a system.

Once sessions, devices, revocation and multiple clients enter the picture, the design needs to go beyond simply generating a token.
