---
title: "Testing Backend Architecture, Not Just Functions"
date: 2026-10-23 06:00:00 +0100
description: "Test backend boundaries, integration behavior, failure handling, and critical workflows to build confidence beyond unit-test coverage."
categories:
  - Backend Engineering
  - Testing
tags:
  - nodejs
  - typescript
  - testing
  - architecture
  - integration-testing
  - test-automation
  - clean-architecture
  - software-quality
---

A backend can have excellent unit-test coverage and still be difficult to trust.

The reason is that functions are only one part of a system.

We also need to test boundaries.

A function may behave correctly in isolation while the repository it calls generates an incorrect query, the message publisher silently loses an event, or the HTTP layer returns an inappropriate response when an operation fails.

These are not necessarily unit-test failures. They are failures in the relationships between components.

When designing backend systems, I consider testing part of the architecture itself. The way application logic depends on infrastructure, the way data moves between layers, and the way failures propagate all influence how a system should be tested.

## Different tests answer different questions

A unit test can ask:

> Does this business rule behave correctly?

An integration test can ask:

> Does this repository correctly communicate with PostgreSQL?

An API test can ask:

> Does this endpoint correctly connect HTTP input to application behavior?

These are different questions.

Each test type provides a different kind of confidence.

| Test type         | Primary question                                                 |
| ----------------- | ---------------------------------------------------------------- |
| Unit tests        | Does the isolated business logic behave correctly?               |
| Integration tests | Do collaborating components work together correctly?             |
| API tests         | Does the HTTP contract behave as expected?                       |
| Contract tests    | Do independently developed components agree on their interfaces? |
| End-to-end tests  | Does a complete critical workflow work across the system?        |

These categories can overlap. An API test, for example, can be an integration test if it exercises the HTTP layer and application dependencies together.

The important distinction is not the label attached to a test.

It is the behavior being verified and the dependencies involved.

## Test business logic independently

This is one reason I prefer application code to depend on interfaces.

A use case can be tested with fake implementations.

That means a test can focus on the business rule without requiring every infrastructure dependency.

Consider an application service that approves a requisition.

Its responsibilities might include checking whether the requisition is eligible for approval, verifying the actor's permissions through an appropriate application boundary, updating the requisition, and requesting any required follow-up work.

The business rule should not need a live Redis instance, an Azure Service Bus connection, or a running email provider merely to determine whether an approval is valid.

A simplified example might look like this:

```ts
interface RequisitionRepository {
  findById(id: string): Promise<Requisition | null>;
  save(requisition: Requisition): Promise<void>;
}

interface ApprovalPublisher {
  publish(event: RequisitionApproved): Promise<void>;
}
```

An application use case can depend on these interfaces rather than concrete infrastructure clients.

A unit test can then provide controlled implementations of the dependencies and verify the important behavior:

- An eligible requisition can be approved.
- An ineligible requisition is rejected.
- An unauthorized actor cannot approve it.
- The correct business state is produced.
- The appropriate event or follow-up action is requested.

The test remains focused on the application's rules.

However, a fake repository cannot prove that the real repository correctly implements persistence. That is a separate responsibility requiring integration tests.

Abstraction makes isolated testing easier, but it does not remove the need to verify the real implementation.

## Integration tests still matter

Abstraction does not eliminate integration testing.

If PostgreSQL is part of production, we need confidence that:

- Queries work.
- Constraints work.
- Transactions work.
- Mappings work.

The same applies to queues, caches and external integrations.

A repository can satisfy its TypeScript interface while generating an incorrect query. A database constraint may behave differently from an assumption encoded in a mock. A transaction may fail under conditions that a unit test never exercises.

For example, if a requisition approval must update the requisition and create an audit record in the same transaction, an integration test should verify the actual database behavior.

It should establish that both changes commit together and that a failure in either operation rolls back the relevant changes.

This is particularly important when using an ORM. The ORM's type safety does not guarantee that every query, migration, relation, or transaction behaves correctly in the deployed database.

Integration tests should use a real instance of the relevant dependency whenever its behavior is part of the contract being tested.

For PostgreSQL, this often means running tests against an isolated test database, commonly provisioned through a disposable container.

The goal is to verify the behavior of the real database rather than reproduce its behavior through a mock.

## Test the boundaries between layers

A layered backend often separates controllers, application services, repositories, and infrastructure adapters.

Each boundary introduces a contract.

For example:

```text
HTTP Controller
      │
      ▼
Application Use Case
      │
      ▼
Repository Interface
      │
      ▼
PostgreSQL Adapter
```

The controller translates HTTP input into an application request. The use case applies business rules. The repository adapter translates application operations into database operations.

Testing only the use case does not establish that the controller validates and maps input correctly.

Likewise, testing only the repository does not establish that the HTTP endpoint returns the correct status code or response structure.

The tests should reflect these responsibilities.

For an API endpoint, relevant assertions may include:

- Invalid input produces the expected validation response.
- Authentication and authorization are enforced.
- The correct application use case is invoked.
- Business errors map to appropriate HTTP responses.
- Successful responses conform to the documented API contract.
- Internal implementation details are not unintentionally exposed.

These checks help identify defects that are easy to miss when testing individual functions.

## Test architecture through dependency direction

Testing also reveals whether the architecture has the boundaries it claims to have.

If a business use case can only be tested by starting PostgreSQL, Redis, a queue, and several external services, it is worth examining its dependencies.

That does not automatically mean the design is wrong. Some operations genuinely require integration testing.

However, if a simple business rule is inseparable from infrastructure initialization, the application may have unnecessary coupling.

A useful structure is:

```text
Application Tests
       │
       ├── Fake Repository
       ├── Fake Message Publisher
       └── Fake External Service

Integration Tests
       │
       ├── Real PostgreSQL
       ├── Real Redis, where required
       └── Real Messaging Adapter, where required
```

The first group verifies application behavior without requiring the complete infrastructure.

The second group verifies that the infrastructure adapters honor their contracts.

This separation allows business rules to be tested quickly while retaining confidence in the actual integrations.

The objective is not to mock everything.

It is to control dependencies where appropriate and exercise real dependencies where their behavior matters.

## Failure testing

A production-oriented test suite should also consider failure.

Examples:

```text
Database unavailable
Queue publish fails
Email provider fails
Duplicate request arrives
Transaction rolls back
External API times out
```

The system's response to failure is part of its behavior.

A system should not be considered reliable simply because its successful execution path works.

Consider a background-job workflow. A job may be accepted successfully but fail during processing. The worker may retry it, encounter the same error repeatedly, or crash after performing an external side effect.

Tests should verify the application's expected behavior in these situations.

Depending on the workflow, that might mean:

- A transient failure is retried according to policy.
- A permanent failure is surfaced for investigation.
- Duplicate processing does not repeat a protected business operation.
- A database transaction rolls back when a required operation fails.
- A failed external dependency does not leave the application in an invalid state.
- Errors are recorded with enough context to support diagnosis.

These tests are especially valuable for asynchronous workflows because the producer, broker, and consumer do not share one execution context.

The test should verify the actual recovery behavior rather than merely assert that an exception was thrown.

## Test transactional consistency

Database transactions and messaging introduce failure scenarios that ordinary happy-path tests may overlook.

Suppose an application creates an order and records an outbox event in the same database transaction.

A useful integration test verifies that both records are committed when the transaction succeeds and neither is committed when the transaction rolls back.

The publisher can then be tested separately to verify that pending events are delivered and their publication state is updated appropriately.

A further test should consider what happens when publication succeeds but the publisher fails before recording that success.

The event may be published again during recovery.

This is where idempotent consumers become important.

Testing the transactional outbox therefore involves more than checking that an event was inserted into a table. It includes persistence, publication, retry, and duplicate-delivery behavior.

The same principle applies to other business operations that coordinate multiple state changes.

Tests should verify the consistency guarantees the architecture is intended to provide.

## Contract testing for replaceable infrastructure

When an application supports multiple infrastructure providers, contract testing becomes particularly useful.

For example, a messaging abstraction might have both a BullMQ adapter and an Azure Service Bus adapter.

Both are expected to satisfy the application's message-publishing contract.

Rather than testing each implementation against unrelated assumptions, define the shared behavior that every adapter must preserve.

This may include:

- Correct message serialization.
- Preservation of message identifiers and correlation metadata.
- Correct handling of publication failures.
- Appropriate error translation.
- Compliance with the application's delivery contract.

The same reusable contract tests can then be run against each adapter where applicable.

However, shared contract tests should not pretend that provider-specific features are identical.

If one provider supports a particular scheduling or settlement behavior and another does not, that difference should be documented and tested explicitly.

Contract testing helps establish that implementations honor the abstraction. It does not prove that two providers have identical operational guarantees.

## End-to-end tests should protect critical workflows

Unit and integration tests do not eliminate the need for end-to-end testing.

Some workflows cross enough boundaries that their combined behavior deserves verification.

Consider a workflow that starts with an authenticated HTTP request, writes a business record, creates an outbox event, publishes a message, and eventually updates the processing status.

An end-to-end test can verify that the complete workflow behaves correctly in a controlled environment.

However, end-to-end tests are usually more expensive and more sensitive to environmental failures than unit tests.

They should therefore focus on important business workflows rather than duplicate every assertion already covered by lower-level tests.

For example, a requisition approval system might prioritize end-to-end tests for:

- Successful approval and audit recording.
- Rejection of an unauthorized approval attempt.
- Recovery from a failed asynchronous operation.
- Prevention of duplicate business effects.
- Correct handling of an invalid state transition.

The objective is to establish confidence in the complete workflow, not to make every test exercise the entire application.

## Avoid testing implementation details

A test can pass consistently and still provide little confidence if it verifies the wrong thing.

For example, asserting that a service calls a particular private helper may couple the test to the current implementation rather than the intended behavior.

A harmless refactoring could then break the test without introducing a real defect.

Prefer assertions about observable outcomes and meaningful contracts.

For a business use case, that might mean verifying the resulting state, the emitted application message, or the error produced for an invalid operation.

For a repository, it might mean verifying persisted records and database constraints.

For an API, it might mean verifying the response status and payload.

Mocks remain useful, especially for controlling failure scenarios. The problem is not mocking itself; it is treating a mock's configured behavior as proof that the real dependency behaves the same way.

Tests should protect the system's intended behavior while allowing internal implementations to evolve.

## Coverage is a signal, not the objective

Code coverage can help identify untested parts of a codebase.

It cannot, by itself, establish that the important business scenarios have been tested.

A test suite can execute every line of a function without verifying the correctness of its decisions.

Likewise, a system with a lower coverage percentage may have strong tests around its most critical business rules and failure boundaries.

Coverage is useful when interpreted alongside other evidence.

I would pay particular attention to:

- Critical business rules and state transitions.
- Authorization and access-control boundaries.
- Transactional consistency.
- Data integrity and database constraints.
- Message delivery and duplicate-processing behavior.
- Recovery from external dependency failures.
- Important API contracts.

These areas often matter more to production confidence than achieving a particular percentage without considering what the tests actually establish.

## Final thought

Testing should follow architectural boundaries.

The goal is not simply to achieve a percentage.

The goal is to establish confidence that the system behaves correctly at each important boundary.

Unit tests help verify business rules. Integration tests verify that real components work together. Contract tests protect agreements between independently implemented components. End-to-end tests establish confidence in critical workflows.

Each has a role.

A well-designed test suite should make it possible to change an infrastructure implementation, refactor application logic, or introduce a new integration without unnecessarily increasing the risk of regressions.

That is the purpose of testing backend architecture, not just functions.
