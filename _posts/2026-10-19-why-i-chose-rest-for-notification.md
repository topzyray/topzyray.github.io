---
title: "Why I Chose REST for Notifications"
date: 2026-10-19 06:00:00 +0100
description: "Choose REST, polling, SSE, or WebSockets for notifications based on delivery needs, while keeping notification processing reliable and asynchronous."
categories:
  - Backend Engineering
  - System Design
tags:
  - nodejs
  - typescript
  - rest
  - notifications
  - architecture
---

Not every notification system needs WebSockets.

That is one of the architectural decisions I have been thinking through while designing backend communication systems.

Real-time communication has its place, but introducing it by default can add complexity without necessarily improving the user experience. The better approach is to understand the requirements first and select the communication model that satisfies them.

## Start with the requirement

Before selecting WebSockets, Server-Sent Events (SSE), or polling, we should ask:

> What does the client actually need?

If the requirement is to:

- Retrieve notifications.
- Mark notifications as read or unread.
- Manage notification preferences.
- Retrieve notification data when the client requests it.
- View notifications when opening a page or refreshing a list.

REST can be sufficient.

An HTTP-based API provides a straightforward contract for retrieving notifications, updating their read status, and managing preferences. It also fits naturally into applications that already use REST for their other backend interactions.

The important point is that retrieving a notification and receiving it immediately are different requirements.

If users only need to see their notifications when they open a page, refresh a list, or make a scheduled request, persistent connections may not be necessary.

However, if the application must deliver new notifications to an already-open client with minimal delay, polling alone may not be enough. That requirement should influence the design.

## Why avoid unnecessary real-time complexity?

Real-time communication introduces additional concerns:

- Persistent connections and their lifecycle.
- Reconnection and recovery after network interruptions.
- Connection management across multiple application instances.
- Load balancing and connection distribution.
- Connection state and resource consumption.
- Authentication and authorization throughout the connection lifecycle.
- Observability for connection failures and delivery delays.

These problems can be justified when the product requires real-time updates.

But they should be driven by requirements, not by the assumption that a more sophisticated communication mechanism is automatically a better one.

For example, WebSockets may be appropriate for collaborative applications, live operational dashboards, chat systems, or workflows where clients need frequent bidirectional communication.

For a conventional notification centre, however, an HTTP endpoint may provide everything the client needs.

A simpler communication model can reduce operational overhead, make the API easier to test, and allow the team to focus on notification correctness rather than connection management.

That does not mean REST is always cheaper or better. It means the additional complexity of real-time infrastructure should deliver a measurable benefit.

## Notifications can be asynchronous internally

Choosing REST for the client-facing API does not mean notification generation has to be synchronous.

This distinction is important.

A business operation should not necessarily have to wait for an email, SMS, push notification, or in-app notification to be generated before it can complete.

The architecture can be:

```text
Business Event
      │
      ▼
Message / Job
      │
      ▼
Notification Worker
      │
      ▼
Notification Store
      │
      ▼
REST API
      │
      ▼
Client
```

For example, when a requisition is approved, the business operation can record the approval and initiate the notification workflow. A background worker can then process the notification and persist the resulting in-app notification.

The client retrieves that notification through REST.

This separates three concerns:

1. **Business processing:** The operation that causes the notification.
2. **Notification processing:** The creation and handling of the notification, potentially through a background job.
3. **Notification retrieval:** The API through which the client accesses the notification.

Each concern can evolve independently, provided the boundaries and contracts remain clear.

There is also an important reliability consideration: if the business transaction commits but the notification job is never published, the user may not receive the expected notification. For workflows where this matters, a transactional outbox can help ensure that the intent to publish a notification is recorded atomically with the business change.

Background processing also requires appropriate retry policies, idempotency, and failure monitoring. A job should not create duplicate notifications every time a worker retries an operation.

REST simplifies the client-facing communication boundary; it does not remove the need for reliable asynchronous processing.

## Preferences belong in the design

A notification system also needs preferences.

Different users or identities may have different preferences for:

- Email.
- SMS.
- Push notifications.
- In-app notifications.

Those decisions should be represented explicitly rather than hard-coded into business workflows.

For example, a business service should not need to know whether a particular user wants email notifications or push notifications. It should communicate the relevant business event or notification intent to the notification system, which can apply the appropriate preferences and delivery rules.

Preferences may also depend on notification category, urgency, organization policy, or whether a channel is available and supported.

However, preferences should not be confused with mandatory operational messages. Security alerts, compliance notices, and other critical communications may require different rules from ordinary informational notifications.

Separating these concerns makes the system easier to maintain and allows notification channels to evolve without forcing changes throughout the business domain.

## What if real-time delivery becomes necessary?

Choosing REST today does not mean ruling out real-time delivery permanently.

The system can begin with a REST API for notification retrieval and introduce polling, SSE, or WebSockets later if actual product requirements justify the additional complexity.

Each option has different characteristics:

- **REST with polling:** The client periodically requests updates. It is straightforward, but frequent polling can generate unnecessary requests.
- **Server-Sent Events (SSE):** The server streams updates to the client over a persistent, one-way connection. It can suit notification feeds where the server needs to push updates and the client does not need bidirectional messaging over the same connection.
- **WebSockets:** The client and server maintain a bidirectional communication channel. This is useful when both sides need to exchange frequent real-time messages.

Regardless of the delivery mechanism, the persisted notification record should remain the source of truth. A real-time event can tell the client that new data is available, but the client should not have to rely on a transient connection to recover notifications it missed while offline.

That separation also makes it easier to support multiple client types, including web and mobile applications, without tying notification history to a particular connection.

## Final thought

Technology selection should follow requirements.

If real-time delivery is necessary, real-time infrastructure may be justified.

If it is not, REST can provide a simpler and more maintainable communication boundary.

The goal is not to choose the technology with the most capabilities. It is to choose the simplest architecture that satisfies the requirements reliably, while leaving room for the system to evolve when those requirements change.
