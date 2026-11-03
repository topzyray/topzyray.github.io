---
title: "Request Context in Node.js: Understanding AsyncLocalStorage"
date: 2026-11-05 06:00:00 +0100
description: "Understand how AsyncLocalStorage can propagate request-scoped information such as user identity and correlation IDs across asynchronous Node.js operations."
categories:
  - Backend Engineering
  - Node.js
tags:
  - nodejs
  - typescript
  - async-local-storage
  - nestjs
  - request-context
  - observability
---

A backend request usually passes through several layers before it is completed.

A request may enter through a controller, pass through an application service, interact with multiple repositories, publish an event, and produce several log entries.

Some information remains relevant throughout that journey.

For example:

- the authenticated user;
- the session identifier;
- the correlation identifier;
- the request identifier;
- the tenant or organizational context, where applicable.

Passing all these values manually through every method can become repetitive.

This is one reason request-scoped context is useful.

## The problem with passing context everywhere

Consider a service that calls another service, which then calls a repository.

```ts
await userService.updateUser({
  userId,
  correlationId,
  sessionId,
  input,
});
```

The next layer may need to pass the same context again:

```ts
await repository.update({
  userId,
  correlationId,
  sessionId,
  input,
});
```

This can become noisy, especially when several unrelated methods need access to the same request metadata.

It also increases the risk of accidentally omitting a value.

One response is to introduce a request context that is available throughout the asynchronous execution associated with a request.

Node.js provides `AsyncLocalStorage` for this purpose.

## What is AsyncLocalStorage?

`AsyncLocalStorage` is an API in Node.js that allows state to be associated with an asynchronous execution context.

The state can remain available across supported asynchronous operations without passing it explicitly through every function call.

The official [Node.js AsyncLocalStorage documentation](https://nodejs.org/api/async_context.html#class-asynclocalstorage) describes how to create and access these contexts.

A simplified example:

```ts
import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  userId?: string;
  sessionId?: string;
  correlationId: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();
```

A request can establish its context:

```ts
requestContext.run(
  {
    correlationId: crypto.randomUUID(),
  },
  async () => {
    await handleRequest();
  },
);
```

Code executing within the associated asynchronous context can retrieve it:

```ts
const context = requestContext.getStore();

console.log(context?.correlationId);
```

The key idea is that the context is associated with the asynchronous execution, not with a global variable shared by every request.

## Why a global variable is dangerous

Consider this:

```ts
let currentUserId: string | undefined;
```

It may appear to work when handling one request at a time.

But Node.js applications commonly process multiple requests concurrently.

Imagine:

```text
Request A sets User A
Request B sets User B
Request A reads currentUserId
```

The global variable may now contain User B.

That is a cross-request state leak.

A request context mechanism is designed to keep asynchronous state isolated between executions.

This is especially important when storing identity-related metadata.

However, `AsyncLocalStorage` should not be treated as an authorization mechanism. It helps propagate context; it does not prove that the values are trustworthy.

The authenticated identity and permissions must still be established and validated through the application's security flow.

## Establish context at the request boundary

A common approach is to establish the initial context in middleware.

For example:

```ts
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    this.context.run(
      {
        correlationId: crypto.randomUUID(),
      },
      next,
    );
  }
}
```

The actual implementation should also consider an incoming correlation identifier if the application accepts one from a trusted upstream system.

An externally supplied identifier should be validated and handled according to a defined policy. It should not be allowed to introduce arbitrary or malformed values into logs.

After authentication, the application can associate the verified user and session information with the existing request context.

For example:

```ts
this.context.setUser({
  userId: authenticatedUser.id,
  sessionId: authenticatedSession.id,
});
```

The exact integration depends on the authentication mechanism and the point at which the authenticated principal becomes available.

The important distinction is that the context should be populated from verified authentication data, not blindly copied from request headers or body fields.

## A small context service

I prefer exposing context operations through a service rather than allowing every part of the application to use `AsyncLocalStorage` directly.

For example:

```ts
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  setUser(identity: Pick<RequestContext, "userId" | "sessionId">): void {
    const context = this.storage.getStore();

    if (!context) {
      throw new Error("Request context is not available");
    }

    Object.assign(context, identity);
  }
}
```

This is an illustrative implementation. A production service should define which fields are mutable, how context is established for non-HTTP operations, and what happens when context is unavailable.

For example, a scheduled job or message consumer may not have an HTTP request, but it may still need a correlation identifier and an explicit system or actor context.

## Request context and database operations

This becomes particularly useful when a backend needs to establish database context.

Suppose the application uses PostgreSQL Row-Level Security and transaction-local settings.

The request context may provide a verified user identifier to the database transaction wrapper.

Conceptually:

```text
HTTP Request
     │
     ▼
Authentication
     │
     ▼
Request Context
     │
     ▼
Database Transaction
     │
     ├── Set app.user_id
     ├── Set app.correlation_id
     │
     ▼
Protected Database Queries
```

The transaction wrapper can retrieve the context and establish the relevant PostgreSQL settings before protected queries execute.

The request context does not replace the database transaction. It supplies information that the transaction boundary can use.

The distinction matters because request context and database session context have different lifetimes and guarantees.

## Context does not automatically cross process boundaries

`AsyncLocalStorage` is useful within one Node.js process and its asynchronous execution contexts.

It does not automatically propagate context into:

- another microservice;
- a separate worker process;
- an external queue;
- a scheduled job running independently;
- a different server.

When work crosses one of these boundaries, the relevant metadata must be included explicitly in the message or job payload.

For example:

```ts
interface JobEnvelope<TPayload> {
  jobId: string;
  correlationId: string;
  payload: TPayload;
}
```

The receiving worker can establish a new asynchronous context using the correlation identifier from the envelope.

This is important for tracing a workflow that starts with an HTTP request and continues through background processing.

A request context is not a substitute for message contracts or distributed tracing.

## Do not store everything in request context

There is also a temptation to use request context as a convenient location for every value an application needs.

That can create hidden dependencies.

I would avoid placing large business objects, mutable domain entities, or arbitrary request data into a global context.

The context should contain small pieces of metadata that genuinely apply across the execution.

Business inputs should still be passed explicitly to the operations that require them.

This keeps method dependencies understandable and prevents request context from becoming an invisible service locator.

## Final thought

Request context is useful because it reduces repetitive parameter passing and provides a consistent way to propagate metadata across asynchronous operations.

But it must be used deliberately.

It should not replace authentication, authorization, explicit business inputs, or message contracts. It should not be treated as a mechanism for sharing mutable state across requests.

For a Node.js backend, `AsyncLocalStorage` provides a practical foundation for request-scoped context.

The real engineering work is deciding what belongs in that context, where it should be established, and how it should be propagated when work moves beyond the original request.
