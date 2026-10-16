---
title: "Building Frontends That Respect Backend Architecture"
date: 2026-10-26 06:00:00 +0100
description: "Apply clear frontend boundaries by separating server and client state, centralizing API access, and organizing code around features."
categories:
  - Frontend Engineering
  - Full-Stack Engineering
tags:
  - nextjs
  - react
  - typescript
  - react-query
  - zustand
---

Although much of my recent architectural focus has been backend engineering, full-stack systems have reminded me that frontend architecture also needs boundaries.

A backend can be beautifully designed and still become difficult to work with if the frontend mixes networking, server state, local state and UI behavior indiscriminately.

When every component is responsible for fetching data, handling errors, managing loading indicators, transforming responses and maintaining shared state, the application gradually becomes harder to reason about.

Small changes begin to affect unrelated components. API changes spread across the UI. State becomes difficult to trace. Components become tightly coupled to implementation details that should have remained behind a boundary.

These are not necessarily problems with React or any particular frontend framework.

They are architectural problems.

The same principles that make backend systems easier to maintain—separation of concerns, explicit contracts and clear ownership—also apply to frontend engineering.

## Separate server state from client state

This distinction is particularly important.

Data retrieved from an API is server state.

Examples include:

- users;
- requisitions;
- inventory;
- notifications.

UI state is different.

Examples include:

- modal visibility;
- selected filters;
- temporary form state.

These two categories should not automatically be managed the same way.

Server state represents information owned by an external system, usually the backend. It may become stale, change independently of the current browser session, require refetching, and need synchronization after mutations.

Client state represents information that the frontend owns for the current interaction or application experience.

For example, a requisition list may be server state, while the currently selected status filter is client state. The filtered result may be derived from those two values rather than stored as another independent copy.

This distinction matters because every additional copy of the same data creates another opportunity for inconsistency.

If a requisition is approved, the frontend should not have to manually update several unrelated stores and component states to keep the interface synchronized.

Instead, the architecture should make it clear where the authoritative data comes from and how the UI responds when that data changes.

## React Query

For server state, TanStack Query (formerly React Query) provides useful mechanisms around:

- fetching;
- caching;
- invalidation;
- mutations;
- loading states;
- error states.

That reduces the temptation to put every API response into a global client store.

It also provides a consistent approach to concerns that otherwise tend to be implemented repeatedly across components.

For example, a requisition query can be defined independently of the component that displays the result:

```ts
import { useQuery } from "@tanstack/react-query";

import { requisitionsApi } from "@/lib/api/requisitions";

export function useRequisitions() {
  return useQuery({
    queryKey: ["requisitions"],
    queryFn: () => requisitionsApi.list(),
  });
}
```

A page or component can consume the query and focus on presentation:

```tsx
"use client";

import { useRequisitions } from "@/hooks/use-requisitions";

export function RequisitionList() {
  const { data: requisitions, isPending, isError } = useRequisitions();

  if (isPending) {
    return <p>Loading requisitions...</p>;
  }

  if (isError) {
    return <p>Unable to load requisitions.</p>;
  }

  return (
    <ul>
      {requisitions.map((requisition) => (
        <li key={requisition.id}>{requisition.reference}</li>
      ))}
    </ul>
  );
}
```

These examples assume that the API client returns data in the shape expected by the component. In a production application, that contract should be defined and validated appropriately.

Mutations should also have an explicit strategy for keeping cached data consistent. Depending on the operation, that might involve invalidating a query, updating cached data, or using an optimistic update with appropriate rollback behavior.

There is an important distinction here: caching does not make the frontend the source of truth. It provides a mechanism for reusing and synchronizing data that is ultimately owned by the backend.

Query keys, invalidation rules and mutation behavior are therefore part of the frontend's data architecture, not just implementation details.

## Zustand

A lightweight client-state library such as Zustand can instead handle application state that genuinely belongs on the client.

For example, an application might need to retain sidebar visibility, a temporary multi-step workflow, or a shared selection used across several components.

Zustand can provide a simple way to manage that state without introducing unnecessary complexity.

```ts
import { create } from "zustand";

type WorkspaceState = {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  sidebarOpen: true,

  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),
}));
```

The store owns the sidebar's UI state. It does not need to own the API responses displayed inside the sidebar.

This is the architectural distinction I want to preserve.

A global store should not become the default destination for every piece of data simply because multiple components need access to it.

Before adding state to a shared store, it is worth asking whether that state actually needs to be shared, whether it can be derived, and who owns its lifecycle.

Not every state value needs a library. Local component state remains appropriate for interactions that do not need to be shared, while form libraries can handle more involved form state and validation.

The architectural distinction is more important than the particular library.

## API clients

I also prefer keeping HTTP concerns behind a consistent client boundary.

For example:

```text
UI
 │
 ▼
Query / Mutation
 │
 ▼
API Client
 │
 ▼
Backend
```

The UI should not need to understand every Axios configuration detail.

A centralized API client can own concerns such as:

- base URLs and request configuration;
- authentication and credential handling;
- request and response interceptors;
- timeout behavior;
- consistent error normalization;
- request metadata and correlation identifiers, where appropriate.

Feature-specific API modules can then expose operations in terms that make sense to the application.

For example, a requisition module might expose `list()`, `getById()` and `approve()`, rather than requiring every component to construct its own HTTP requests.

```ts
import { apiClient } from "@/lib/api/client";
import type { Requisition } from "@/types/requisition";

export const requisitionsApi = {
  async list(): Promise<Requisition[]> {
    const response = await apiClient.get<Requisition[]>("/requisitions");

    return response.data;
  },

  async approve(id: string): Promise<Requisition> {
    const response = await apiClient.post<Requisition>(
      `/requisitions/${id}/approve`,
    );

    return response.data;
  },
};
```

This example illustrates the boundary; a real implementation should use the actual response envelope and error contract defined by the backend.

The benefit is not simply fewer lines of code.

It is the ability to change HTTP configuration, error handling or transport details without rewriting every component that consumes the API.

It also gives the frontend a natural place to translate technical transport concerns into application-level behavior.

However, a shared client should not become an excuse to hide important semantics. Authentication failures, authorization failures, validation errors and transient network failures may require different responses. A generic interceptor should not silently treat them all as equivalent.

## Respect the backend contract

A frontend and backend are not independent systems that happen to communicate over HTTP.

They are two parts of a system with an explicit contract.

That contract includes more than endpoint URLs. It also includes request and response shapes, validation rules, authorization behavior, pagination, error formats, and the meaning of successful operations.

For example, hiding an approval button in the UI does not enforce authorization. The backend must still verify that the current identity has permission to approve the requisition.

Similarly, frontend validation can improve usability, but the backend remains responsible for enforcing business rules.

TypeScript helps maintain consistency within the frontend codebase, but a TypeScript interface does not automatically validate data received over the network at runtime.

Where necessary, runtime schema validation and shared contract definitions can reduce the risk of frontend and backend assumptions drifting apart.

The objective is not to duplicate the entire backend domain model in the browser. It is to establish a clear, dependable contract between the two sides.

## Next.js

Next.js provides another layer of architectural decisions.

With the App Router, developers need to understand:

- server components;
- client components;
- routing;
- data fetching;
- loading and error boundaries.

These concepts influence where code executes, how data reaches the UI, and which responsibilities belong on the server or in the browser.

Server Components are useful for rendering content that does not require browser-side interactivity. They can fetch data on the server and keep server-only implementation details out of the client bundle.

Client Components are appropriate when a feature requires state, event handlers, effects, or browser APIs.

The distinction should be intentional.

Marking a large component tree as client-rendered simply because one small section needs interactivity can expand the client-side JavaScript unnecessarily. Conversely, forcing interactive behavior into Server Components creates avoidable friction.

Data fetching also needs deliberate ownership. Next.js server-side data access and a client-side query cache solve related but different problems.

Server Components can be appropriate for initial rendering and server-side access to data. TanStack Query is useful when the client needs ongoing query caching, refetching, mutation handling, or synchronization during an interactive session.

Using both is possible, but their responsibilities should be clear. Otherwise, the same data may be fetched and cached independently without a coherent invalidation strategy.

Loading and error boundaries deserve similar attention. They should communicate the state of the application meaningfully rather than serve as generic fallbacks that conceal the source of a failure.

Again, the framework should support the application architecture.

It should not determine the architecture by accident.

## Organize around features and responsibilities

As frontend applications grow, folder structure can either reinforce or weaken these boundaries.

A feature-oriented structure can keep related API operations, query hooks, types and components close to one another:

```text
src/
├── app/
│   ├── requisitions/
│   └── inventory/
├── components/
│   ├── ui/
│   └── layout/
├── features/
│   ├── requisitions/
│   │   ├── api/
│   │   ├── hooks/
│   │   ├── components/
│   │   ├── schemas/
│   │   └── types/
│   └── inventory/
│       ├── api/
│       ├── hooks/
│       ├── components/
│       ├── schemas/
│       └── types/
├── lib/
│   └── api/
└── stores/
```

This is one possible arrangement, not a universal prescription.

A small application may not need all these folders. A larger application may benefit from stronger feature boundaries and explicit shared contracts.

The underlying principle is that related responsibilities should be easy to locate, while unrelated features should not become tightly coupled through shared components or global state.

A folder structure alone cannot guarantee good architecture. The imports, ownership rules and dependencies between modules matter more than the names of the directories.

## Final thought

Full-stack engineering is not about treating frontend and backend as unrelated applications.

The contracts between them are part of the architecture.

Server state and client state have different responsibilities. API clients should isolate transport concerns. Components should focus on presenting and interacting with data. Framework features should be used according to their strengths.

These boundaries reduce unnecessary coupling and make changes easier to reason about.

A clean API boundary makes both sides easier to evolve.

A clean frontend architecture helps ensure that the backend's design remains an asset rather than becoming obscured by the way the UI consumes it.
