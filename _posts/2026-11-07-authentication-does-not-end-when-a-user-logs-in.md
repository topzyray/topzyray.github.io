---
title: "Authentication Does Not End When a User Logs In"
date: 2026-11-07 06:00:00 +0100
description: "Explore session validation, token expiry, revocation, device context, and why authentication must remain enforceable throughout a user's session."
categories:
  - Backend Engineering
  - Security
tags:
  - authentication
  - authorization
  - sessions
  - jwt
  - security
  - nestjs
  - postgresql
---

Authentication is often discussed as though it is a single event.

A user provides credentials, the application verifies them, and the application issues a token.

That is only the beginning.

In a production application, authentication also involves managing the session after login, validating whether it remains active, handling expiry and revocation, and ensuring that the identity presented with a request still represents an authorized session.

This is one of the areas I have been considering while working on authentication and database-session management.

## A successful login does not guarantee a valid session forever

Consider a user who logs in successfully.

The application may issue an access token and a refresh token.

The access token allows the client to authenticate subsequent requests. The refresh token can be used to obtain a new access token when the current one expires, depending on the application's design.

But several things can happen after login:

- the user logs out;
- an administrator revokes the session;
- the refresh token is compromised;
- the session expires;
- the user's account is disabled;
- the user's security credentials change;
- the device is no longer trusted.

If the backend only checks whether a token has a valid signature and expiry, it may not know that the associated session has been revoked.

This is an important distinction between validating a token and validating the current session.

## Tokens and sessions solve different problems

A signed access token can carry claims such as:

```json
{
  "sub": "user-id",
  "sid": "session-id",
  "iat": 1793600000,
  "exp": 1793600900
}
```

This is an illustrative payload.

The signature allows the backend to verify that the token was issued by a trusted authority and has not been modified.

The expiry claim limits how long the token is valid.

However, a signed token is not automatically aware of a session revocation that happens after it is issued.

A session record provides a way to maintain server-side state about the authentication session.

For example:

```text
AuthSession
  ├── id
  ├── user_id
  ├── refresh_token_hash
  ├── device_id
  ├── client_type
  ├── expires_at
  ├── revoked
  ├── revoked_at
  └── last_used_at
```

The exact fields depend on the application's requirements.

The important point is that the session record allows the backend to evaluate whether the session is still active.

## Validate the session, not only the token

A request may follow this flow:

```text
Incoming Request
       │
       ▼
Verify Access Token
       │
       ▼
Extract Session ID
       │
       ▼
Load Session
       │
       ▼
Check Expiry and Revocation
       │
       ▼
Establish Authenticated Context
       │
       ▼
Authorize Operation
```

The token establishes a cryptographically verifiable identity claim.

The session check establishes whether the corresponding authentication session is still accepted by the application.

These checks serve different purposes.

For example, if an administrator revokes a session, the application should have a defined way to reject subsequent requests associated with that session.

The exact design depends on whether session validation happens on every request, through a short-lived cache, or through another revocation strategy.

There is a trade-off between immediate revocation and the performance cost of repeatedly checking server-side state.

## Store refresh tokens securely

A refresh token is particularly sensitive because it can be used to obtain new access tokens.

The backend should avoid storing the raw refresh token in the database.

Instead, it can store a cryptographic hash and compare it when the token is presented.

Conceptually:

```ts
const refreshTokenHash = createHash("sha256")
  .update(refreshToken)
  .digest("hex");
```

This example illustrates hashing; the actual token design should use high-entropy, cryptographically secure random values.

The database stores the hash rather than the original token.

If the database is exposed, an attacker does not immediately obtain usable refresh tokens from the stored values.

The application should also define token rotation behavior. When a refresh token is successfully used, the previous token can be invalidated and a new one issued.

Reuse of an already rotated token can indicate token theft or replay and should trigger the application's defined security response.

The [OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html) provides useful guidance on refresh-token protection and rotation.

## Session revocation must be deliberate

A session can be revoked for different reasons:

- user logout;
- administrator action;
- suspected compromise;
- account security changes;
- policy enforcement.

The backend should represent revocation explicitly.

For example:

```sql
UPDATE app.auth_sessions
SET
  revoked = TRUE,
  revoked_at = NOW()
WHERE id = $1
  AND revoked = FALSE;
```

This is more informative than simply deleting the record.

A retained revocation record can support security investigations, session history, and operational traceability, subject to appropriate retention policies.

The application should also define whether revoking one session affects other sessions belonging to the same user.

Logging out from one device should not automatically mean that every other device is logged out unless that is the intended policy.

## Concurrency matters during session validation

There is another detail that becomes important when session validation and database operations happen together.

Suppose a request validates a session and then performs a sensitive operation.

At almost the same time, another operation revokes that session.

The system needs a clear policy for how those operations interact.

One approach is to validate the session within the same database transaction that establishes the request's database context.

Depending on the required consistency guarantees, the validation query may use a row lock to coordinate with concurrent session changes.

For example:

```sql
SELECT id
FROM app.auth_sessions
WHERE id = $1
  AND revoked = FALSE
  AND revoked_at IS NULL
  AND expires_at > clock_timestamp()
FOR SHARE;
```

This is an illustrative query. The correct locking strategy depends on the session-revocation workflow, transaction isolation requirements, and how concurrent operations are expected to behave.

A lock can coordinate concurrent access, but it also affects transaction duration and contention.

The important point is that session validation should not be treated as an unrelated preliminary check when the operation requires stronger consistency.

## Device and client context

Modern applications may support several client types:

- web browsers;
- mobile applications;
- desktop applications.

A session can record its client type and a device identifier where appropriate.

This can help with session management and user-visible security controls.

For example, a user may be able to view active sessions and revoke access from a device they no longer use.

However, a device identifier is not proof of identity by itself.

It should be treated as supporting session metadata, not as a replacement for authentication.

The application should also be careful about what it records in user-agent and IP-address fields. These values can be useful for security monitoring, but they are not always reliable indicators of the person using the account.

## Authentication and authorization remain separate

A valid session does not mean that every operation is permitted.

Authentication establishes the identity associated with a request.

Authorization determines what that identity can do.

A user may have an active session but lack permission to approve a particular request, access a restricted record, or perform an administrative action.

The backend must still evaluate the relevant role, permissions, resource ownership, organizational context, and business rules.

A valid login should never be treated as universal authorization.

## Final thought

Authentication is not complete when the login endpoint returns a token.

A production application needs a lifecycle for sessions: creation, validation, refresh, rotation, expiry, revocation, and investigation.

Tokens help establish identity claims. Session records help the backend manage ongoing authentication state.

The system must also define how these checks interact with concurrent operations, database transactions, and authorization rules.

A successful login tells us that authentication succeeded at a particular moment.

It does not mean the session should remain trusted indefinitely.
