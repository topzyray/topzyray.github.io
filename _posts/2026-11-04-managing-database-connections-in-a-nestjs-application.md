---
title: "Managing Database Connections in a NestJS Application"
date: 2026-11-04 06:00:00 +0100
description: "Explore database connection lifecycle management in NestJS, including connection pools, dependency injection, graceful shutdown, and transaction boundaries."
categories:
  - Backend Engineering
  - NestJS
tags:
  - nestjs
  - nodejs
  - typescript
  - postgresql
  - connection-pooling
  - database
---

A backend application does not communicate with PostgreSQL simply because a database client has been imported.

There is a lifecycle to manage.

The application needs to establish database connections, reuse them efficiently, make them available to the components that require them, and release resources when the process shuts down.

This is one of the areas I have been paying attention to while working on a NestJS application using PostgreSQL and Drizzle.

## A database connection is a managed resource

A database connection consumes resources on both the application and database servers.

Opening a new connection for every query is generally not a sensible approach for an application that handles concurrent requests.

Instead, applications commonly use connection pools.

A pool maintains a collection of reusable connections and makes them available to queries as needed.

```text
NestJS Application
       │
       ▼
  Database Service
       │
       ▼
  Connection Pool
       │
       ├── Connection 1
       ├── Connection 2
       ├── Connection 3
       └── Connection N
                │
                ▼
            PostgreSQL
```

When a query needs a connection, the pool provides one. When the operation completes, the connection can be returned for reuse.

This avoids repeatedly creating and closing database connections.

The `pg` package provides a `Pool` implementation for Node.js applications. Its [pool documentation](https://node-postgres.com/apis/pool) explains configuration, connection acquisition, and pool lifecycle management.

## Avoid creating multiple pools accidentally

A common design mistake is allowing different modules or repositories to create their own database pools.

For example:

```ts
@Injectable()
export class UserRepository {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}
```

If several repositories follow this pattern, the application may create multiple independent pools.

That makes connection usage harder to control.

It can also increase the number of connections opened against PostgreSQL beyond what the application actually needs.

A better approach is to centralize connection creation and expose the configured database client through dependency injection.

For example:

```ts
export const DATABASE_POOL = Symbol("DATABASE_POOL");
export const DATABASE_CLIENT = Symbol("DATABASE_CLIENT");
```

The infrastructure module can provide the pool and database client:

```ts
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => {
        return new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });
      },
    },
    {
      provide: DATABASE_CLIENT,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => {
        return drizzle(pool, {
          schema,
        });
      },
    },
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule {}
```

The values above are examples, not universal production settings. Pool size and timeout values should be chosen based on the application's concurrency, database capacity, deployment topology, and workload.

The important design decision is that connection creation has one clear owner.

## Wrap the client in a database service

A database service can provide a consistent interface to the rest of the application.

```ts
@Injectable()
export class DatabaseService {
  constructor(
    @Inject(DATABASE_CLIENT)
    readonly db: NodePgDatabase<typeof schema>,
  ) {}
}
```

Repositories can depend on the service or on a more specific database abstraction.

This keeps database configuration out of individual repositories.

However, I would avoid turning the database service into a place where every query in the application is implemented. Its main responsibility should be connection and database infrastructure, not ownership of all business persistence logic.

## The application must close the pool

Opening connections is only half of the lifecycle.

The application must also release them when it shuts down.

In NestJS, lifecycle hooks can be used for this.

```ts
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_POOL)
    private readonly pool: Pool,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
```

NestJS supports lifecycle hooks for application initialization and shutdown. See its [lifecycle events documentation](https://docs.nestjs.com/fundamentals/lifecycle-events).

The application must also enable shutdown hooks where appropriate:

```ts
const app = await NestFactory.create(AppModule);

app.enableShutdownHooks();

await app.listen(process.env.PORT ?? 3000);
```

This allows the application to respond to supported termination signals and run its shutdown lifecycle.

Graceful shutdown matters during deployments, container restarts, and process termination.

The goal is to stop accepting new work, allow in-flight operations to finish within an appropriate deadline, and release resources cleanly.

## Pool sizing is not guesswork

It is tempting to increase the pool size whenever an application experiences database delays.

That is not always the correct response.

A database has finite resources. If several application instances each create a large pool, the combined number of possible connections can become excessive.

For example:

```text
5 Application Instances
× 20 Connections Per Instance
= 100 Possible Connections
```

This does not mean that 100 connections are always wrong. It illustrates why pool sizing must account for the entire deployment rather than one process in isolation.

The application should consider:

- the PostgreSQL connection limit;
- the number of application instances;
- expected concurrent database operations;
- query duration;
- background worker concurrency;
- administrative and monitoring connections;
- other applications sharing the database.

A larger pool cannot compensate for inefficient queries or unnecessarily long transactions.

In some cases, reducing query duration or worker concurrency is more effective than increasing the pool size.

## Connection management and transactions are related

A transaction requires a connection that remains associated with its operations.

That means the database service must support transaction-scoped execution correctly.

For example:

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values(userInput);
  await tx.insert(userProfiles).values(profileInput);
});
```

The transaction callback should use `tx` for every operation that must participate in the transaction.

It should not switch back to the global database client halfway through the operation.

This becomes particularly important when transaction-local PostgreSQL settings are used for user context or Row-Level Security.

Connection management is therefore not separate from data consistency or database security. It provides part of the foundation for both.

## Health checks should reflect useful conditions

A database health check can help determine whether the application can communicate with PostgreSQL.

However, it should not become an expensive query executed too frequently.

A simple connectivity check may be enough for a liveness or readiness probe, depending on the deployment design.

It is also important to distinguish between:

- **Liveness:** Is the application process functioning?
- **Readiness:** Can the application currently serve the operations it is responsible for?
- **Dependency health:** Is PostgreSQL reachable and accepting the required operations?

A database outage does not necessarily mean the application process itself should be restarted repeatedly.

Health checks should support operational decisions rather than create unnecessary restart loops.

## Final thought

Database connection management is infrastructure work, but it has consequences throughout the application.

A poorly managed pool can exhaust database resources. An unclosed pool can interfere with graceful shutdown. An incorrectly handled transaction can compromise consistency or security.

In a NestJS application, I prefer having a clear owner for database initialization, configuration, dependency injection, transaction execution, and shutdown.

The objective is not simply to make PostgreSQL available to the application.

It is to manage that dependency deliberately throughout the application's lifecycle.
