---

title: "Designing Backends So Infrastructure Can Change Without Rewriting Business Logic"
date: 2026-10-08 08:00:00 +0100
categories:

* Backend Engineering
* Architecture
  tags:
* nodejs
* typescript
* architecture
* clean architecture
* dependency inversion
* postgresql
* redis
* messaging

---

Yesterday, I wrote about what building production backends has taught me about architecture.

One idea keeps appearing across the systems I work on:

> **Infrastructure should be replaceable without forcing us to rewrite the business logic.**

This does not mean every technology must be interchangeable.

It means the application should not become unnecessarily dependent on infrastructure details.

## The problem with infrastructure leaking into business logic

Consider a service that directly uses Prisma:

```ts
class CreateUser {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: CreateUserInput) {
    return this.prisma.user.create({
      data: input,
    });
  }
}
```

This is simple.

But the application now knows about Prisma.

If the business operation later needs to use another persistence mechanism, the application code has to change.

The same problem can occur with:

- Redis;
- BullMQ;
- email providers;
- object storage;
- external APIs.

The problem is not using these technologies.

The problem is allowing them to become part of the business abstraction.

## Ask what the application actually needs

Instead of asking:

> How do I use Prisma here?

ask:

> What does this use case need from persistence?

Perhaps it needs:

```ts
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

Now the application depends on a capability.

The infrastructure can implement that capability.

```text
Application
     │
     ▼
UserRepository
     ▲
     │
PostgresUserRepository
```

The application does not need to know how the repository works internally.

## This is dependency inversion

The important dependency is no longer:

```text
Application → Prisma
```

It becomes:

```text
Application → Repository Contract
                           ▲
                           │
                     Prisma Adapter
```

The direction of dependency changes.

This gives the application more independence from infrastructure.

## The same principle applies to messaging

This is particularly relevant to the messaging architecture I have been designing.

Suppose an application directly calls BullMQ:

```ts
await queue.add("notification", payload);
```

The application now knows that a particular queue implementation exists.

Instead, the application can depend on something closer to:

```ts
interface MessageBus {
  publish<T>(message: DomainMessage<T>): Promise<void>;
}
```

Then the infrastructure can provide an implementation.

For example:

```text
MessageBus
   │
   ├── BullMQ / Redis
   │
   └── Azure Service Bus
```

The business operation remains focused on the fact that a message needs to be published.

It does not need to know which messaging infrastructure delivers it.

## This does not mean the technologies are identical

There is an important qualification.

BullMQ and Azure Service Bus are not interchangeable in every respect.

Different messaging systems provide different semantics and capabilities.

They may differ in:

- retry behavior;
- ordering;
- acknowledgement;
- dead-lettering;
- scheduling;
- delivery guarantees;
- partitioning.

Therefore, the abstraction must represent the guarantees the application actually needs.

The goal is not to create a fake generic queue.

The goal is to prevent unnecessary infrastructure coupling.

## Email has the same problem

Imagine a registration workflow that directly calls an email provider:

```ts
await sendGrid.send(...);
```

The registration use case now knows which provider is being used.

A better boundary could be:

```ts
interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
```

The application cares about sending an email.

The infrastructure cares about how that email is delivered.

```text
EmailSender
    │
    ├── Provider A
    ├── Provider B
    └── SMTP
```

The same idea can be applied to other external services.

## File storage

Consider file uploads.

Business logic should not necessarily need to know whether a file is stored in a particular cloud object-storage service.

A business-level abstraction could be:

```ts
interface FileStorage {
  put(input: UploadInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}
```

Then:

```text
FileStorage
    │
    ├── Cloud Storage Adapter
    ├── Another Storage Adapter
    └── Local Adapter
```

Again, the business operation remains focused on the capability.

## Database abstraction does not mean pretending databases are the same

This is an important distinction.

I do not want to create a giant abstraction such as:

```ts
repository.find({
  where: ...,
  orderBy: ...,
  include: ...,
});
```

and pretend PostgreSQL and every other database are identical.

That usually creates a lowest-common-denominator abstraction.

Instead, I want the repository interface to express operations meaningful to the business.

For example:

```ts
interface RequisitionRepository {
  findPendingApprovals(officeId: string): Promise<Requisition[]>;
}
```

The PostgreSQL implementation can then use the appropriate database capabilities.

The abstraction protects the business layer without unnecessarily restricting the infrastructure.

## The composition root

There needs to be somewhere that decides which implementation the application uses.

That is where composition becomes useful.

Conceptually:

```ts
const userRepository = new PostgresUserRepository(prisma);

const messageBus = new BullMqMessageBus(queue);

const emailSender = new EmailProviderAdapter(client);

const application = new Application({
  userRepository,
  messageBus,
  emailSender,
});
```

The important point is that these decisions happen at the edge.

The business logic does not construct its own infrastructure dependencies.

## This also improves testing

Suppose a use case depends on:

```ts
interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
```

A test can provide:

```ts
class FakeEmailSender implements EmailSender {
  messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}
```

The test does not need a real email provider.

Likewise, a repository can have an in-memory implementation for focused tests.

This makes it possible to test business behavior without requiring every external dependency.

## Infrastructure failures become explicit

This architecture also forces us to think about failure.

What happens if:

```text
Database → unavailable
Queue → unavailable
Email provider → timeout
Storage → unavailable
External API → returns error
```

The application needs an explicit policy for each dependency.

For example:

- Should the request fail?
- Should the operation be retried?
- Should the work become asynchronous?
- Should the failure be recorded?
- Can the operation be safely repeated?

These are architectural decisions.

## Replaceability is not the same as abstraction everywhere

There is a balance here.

I do not want:

```text
Everything
   ↓
Interface
   ↓
Factory
   ↓
Adapter
   ↓
Provider
```

simply because architectural patterns exist.

Every abstraction introduces some complexity.

I want boundaries around dependencies that are:

- external;
- expensive to change;
- likely to vary;
- difficult to test directly;
- important enough to deserve explicit semantics.

## The architecture I am aiming for

The overall direction looks like this:

```text
                    HTTP / Jobs / Events
                            │
                            ▼
                    Presentation Layer
                            │
                            ▼
                    Application Layer
                            │
                            ▼
                      Domain Layer
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
          Repository Port          Message Port
                │                       │
                ▼                       ▼
          Database Adapter         Message Adapter
                │                       │
                ▼                       ▼
           PostgreSQL            Queue / Broker
```

Other infrastructure concerns can follow the same principle:

```text
Email
Storage
Cache
External APIs
Observability
```

## What this changes about framework choice

This thinking also changes how I evaluate Express and NestJS.

If the business architecture is independent of the HTTP framework, then the framework becomes an implementation detail at the boundary.

That means the same application concepts can potentially be exposed through:

```text
Express
```

or:

```text
NestJS
```

without redesigning the business domain.

That is a much more useful form of framework independence than simply saying that two frameworks can technically perform the same HTTP operations.

## The real objective

I am not trying to predict every technology I will use five years from now.

That would be unrealistic.

I am trying to avoid unnecessary coupling today.

If the application depends on an abstraction representing a business capability, infrastructure can evolve behind that boundary.

That gives the system room to change.

## Final thought

The most useful abstraction is not necessarily the one that hides the most code.

It is the one that creates a meaningful boundary around a dependency.

For me, the practical objective is simple:

```text
Infrastructure changes
        ↓
Limited infrastructure changes
        ↓
Business logic remains stable
```

That is the kind of architecture I want to continue building and refining as I work on larger Node.js systems.
