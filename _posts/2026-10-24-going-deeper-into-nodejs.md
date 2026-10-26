---
title: "Going Deeper Into Node.js: Understanding the Runtime Behind the Framework"
date: 2026-10-24 06:00:00 +0100
description: "Go beyond framework APIs to understand the Node.js event loop, concurrency, streams, memory, networking, and graceful shutdown."
categories:
  - Node.js
  - Backend Engineering
tags:
  - nodejs
  - javascript
  - typescript
  - event-loop
  - performance
  - streams
  - concurrency
  - memory-management
---

The more serious my backend engineering work becomes, the less satisfied I am with knowing only the framework APIs.

NestJS and Express are useful abstractions.

But eventually, understanding the runtime underneath them becomes important.

A framework can help organize an application, enforce architectural boundaries, and simplify common backend operations. It cannot eliminate the runtime behavior of the code we write.

When an application becomes slow, memory consumption increases, requests begin timing out, or background work interferes with API responsiveness, the explanation may have little to do with the framework itself.

It may be a consequence of [Node.js](https://nodejs.org) executes JavaScript, manages asynchronous operations, handles data, or uses system resources.

That is why I consider runtime knowledge an important part of backend engineering.

## The framework is not the runtime

When we write:

```ts
await service.execute();
```

there is a substantial amount happening underneath.

[Node.js](https://nodejs.org) manages:

- JavaScript execution.
- Asynchronous operations.
- Event-loop scheduling.
- Networking.
- Timers.
- Streams.
- Process behavior.

It also provides access to operating-system capabilities through its APIs and underlying runtime components.

Understanding these mechanisms helps explain application behavior.

For example, NestJS may handle dependency injection, route registration, guards, interceptors, and exception filters. Express may provide middleware composition and HTTP routing.

But neither framework changes the fundamental execution model of JavaScript on the main thread.

A poorly designed synchronous operation can still block request processing, regardless of how cleanly the application is organized.

Similarly, a memory-intensive operation can still exhaust the process's available memory, even when every service follows a well-defined architecture.

Framework abstractions simplify development. They do not remove the need to understand the system underneath them.

## Why the event loop matters

[Node.js](https://nodejs.org) is designed around asynchronous I/O.

That makes it effective for many backend workloads, particularly applications that spend substantial time waiting for databases, network responses, files, and other external resources.

But asynchronous syntax does not automatically make every operation cheap.

A CPU-heavy operation can still block JavaScript execution.

That means backend engineers need to understand the difference between:

```text
I/O-bound work
```

and:

```text
CPU-bound work
```

I/O-bound work spends much of its time waiting for an external operation to complete. CPU-bound work spends much of its time performing computations.

Consider a typical request:

```ts
const user = await userRepository.findById(userId);
const permissions = await permissionService.getForUser(user);
return permissions;
```

If the repository and permission service perform asynchronous I/O, the JavaScript execution can yield while those operations are pending.

This allows [Node.js](https://nodejs.org) to make progress on other work rather than blocking the main thread while waiting for each response.

However, `await` does not move the underlying computation to another thread automatically.

When an awaited operation is CPU-intensive JavaScript, the computation still runs on the thread executing that JavaScript.

For example:

```ts
const result = expensiveCalculation(largeDataset);
```

If `expensiveCalculation` takes several seconds to execute synchronously, other JavaScript callbacks on that thread must wait.

This can increase API latency, delay timers, and prevent the application from responding promptly to other requests.

The important distinction is not whether a function is declared `async`.

It is what the function actually does and where that work executes.

## Understanding the event loop beyond `async` and `await`

The [event loop](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick) is central to how [Node.js](https://nodejs.org) coordinates JavaScript execution and asynchronous operations.

At a high level, the runtime executes JavaScript callbacks and processes scheduled work as the relevant operations become ready.

[Node.js](https://nodejs.org) uses the event loop and underlying mechanisms such as libuv to coordinate I/O, timers, and other asynchronous activity.

Promises and `async`/`await` also involve microtask scheduling, which affects the order in which callbacks execute.

For example:

```ts
console.log("A");

setTimeout(() => {
  console.log("B");
}, 0);

Promise.resolve().then(() => {
  console.log("C");
});

console.log("D");
```

In a normal execution of this example, the output is:

```text
A
D
C
B
```

The synchronous statements execute first. The resolved promise's reaction runs as a microtask before the timer callback in this example.

The exact scheduling behavior becomes more nuanced when multiple event-loop phases, I/O callbacks, and different scheduling APIs are involved.

The practical lesson is that asynchronous code is not necessarily executed in the order in which developers intuitively expect it to be.

Understanding scheduling becomes particularly useful when debugging race conditions, unexpected callback ordering, delayed timers, and performance problems.

## Asynchronous does not mean parallel

One distinction worth understanding is the difference between concurrency and parallelism.

Concurrency means multiple operations can make progress over overlapping periods.

Parallelism means multiple operations execute at the same time.

[Node.js](https://nodejs.org) can handle many concurrent I/O operations without requiring a separate JavaScript thread for each request.

For example:

```ts
const [user, orders, settings] = await Promise.all([
  userRepository.findById(userId),
  orderRepository.findByUserId(userId),
  settingsService.getForUser(userId),
]);
```

If these operations are independent, `Promise.all` allows them to be initiated together rather than waiting for each one to finish before starting the next.

However, this does not mean the JavaScript computations inside all three operations execute in parallel on the main thread.

It also does not mean unlimited concurrency is desirable.

Launching thousands of database queries simultaneously can exhaust connection pools, overload the database, and increase latency across the application.

Concurrency must be managed according to the capacity of the dependencies involved.

For large workloads, bounded concurrency, batching, backpressure, and queue-based processing can be more appropriate than creating an unrestricted number of concurrent operations.

The goal is not simply to make more operations concurrent.

It is to make progress efficiently without overwhelming the system.

## CPU-heavy work needs a different strategy

Some workloads are naturally expensive in terms of CPU.

Examples include:

- Large data transformations.
- Complex report generation.
- Image processing.
- Compression and decompression.
- Cryptographic computations.
- Computationally intensive parsing.

If such work executes synchronously on the main JavaScript thread, it can delay unrelated requests.

There are several possible responses, depending on the workload.

First, optimize the algorithm. Reducing unnecessary computation is often more effective than adding infrastructure.

Second, split work into manageable units where doing so is practical.

Third, use worker threads when CPU-intensive JavaScript can benefit from execution on another thread.

For example, [Node.js](https://nodejs.org/api/worker_threads.html) provides the [`worker_threads`](https://nodejs.org/api/worker_threads.html) module for running JavaScript in parallel across threads.

```ts
import { Worker } from "node:worker_threads";

const worker = new Worker(new URL("./calculation.worker.js", import.meta.url), {
  workerData: {
    input: largeDataset,
  },
});
```

This is an illustrative example of creating a worker; a production implementation also needs result handling, error handling, worker lifecycle management, and an appropriate strategy for reusing or pooling workers.

Creating a new worker for every small task can introduce unnecessary overhead.

For sustained workloads, a worker pool may be more suitable.

It is also important to distinguish worker threads from child processes. Worker threads execute JavaScript in separate threads within the same process, while child processes run in separate operating-system processes with their own memory spaces and lifecycle.

Neither approach automatically makes a workload efficient. The algorithm, data-transfer costs, available CPU resources, and operational requirements still matter.

## Streams matter too

Large files and large data sets should not always be loaded completely into memory.

Streams provide a mechanism for processing data incrementally.

This becomes particularly relevant to:

- Uploads.
- Downloads.
- Exports.
- Imports.
- Large transformations.

Consider an export that retrieves hundreds of thousands of database records.

One approach is to load every record into an array, transform the entire array, and then generate the output.

That can consume substantial memory, especially when several exports run concurrently.

A streaming approach processes data incrementally, allowing the application to work with smaller chunks rather than retaining the entire result in memory.

Conceptually:

```text
Database Cursor
      │
      ▼
Transform Records
      │
      ▼
CSV Formatter
      │
      ▼
HTTP Response or File
```

[Node.js streams](https://nodejs.org/api/stream.html) support this kind of processing.

However, streams do not automatically make every pipeline memory-safe. The source must also avoid buffering the entire dataset, and the pipeline must handle backpressure correctly.

Backpressure allows a slower downstream consumer to influence how quickly upstream components produce data.

Without appropriate backpressure handling, a fast producer can overwhelm a slower consumer and accumulate data in memory.

For stream pipelines, [Node.js](https://nodejs.org) provides utilities such as `pipeline` from `node:stream/promises`, which help coordinate stream completion and error propagation.

For large imports and exports, I also consider batching, database cursor behavior, cancellation, and what happens when the destination disconnects or fails.

The objective is not merely to use streams because the files are large.

It is to design a pipeline whose memory usage and failure behavior remain manageable as the workload grows.

## Memory management and garbage collection

Memory behavior is another area where runtime knowledge becomes useful.

JavaScript provides automatic memory management, so developers do not ordinarily allocate and free memory manually.

However, automatic garbage collection does not mean memory consumption takes care of itself.

An application can retain references to objects it no longer needs. Large caches, unbounded collections, accumulated event listeners, and retained request data can all contribute to excessive memory usage.

For example:

```ts
const requestHistory: unknown[] = [];

app.use((req, _res, next) => {
  requestHistory.push({
    url: req.url,
    timestamp: Date.now(),
  });

  next();
});
```

This simplified example continually accumulates data without a retention policy.

In a long-running process, the collection can grow indefinitely.

The actual memory problem may not be a traditional leak in the sense of manually allocated memory that cannot be freed. It may be reachable data that the application continues to retain unnecessarily.

Garbage collection can reclaim objects that are no longer reachable, but it cannot reclaim objects that remain referenced.

Memory investigations should therefore consider:

- Heap growth over time.
- Retained objects and references.
- Large buffers and external memory.
- Cache size and eviction behavior.
- Concurrent requests and temporary allocations.
- Garbage-collection activity and its effect on latency.

It is also useful to distinguish the JavaScript heap from total process memory. Buffers and other native allocations can contribute to memory consumption outside the JavaScript heap.

This matters when an application approaches its container or operating-system memory limit even though the reported JavaScript heap does not appear unusually large.

## Networking and connection management

Backend applications spend a substantial amount of time communicating with databases, caches, message brokers, and external APIs.

Understanding the runtime's networking behavior helps explain why connection management matters.

Consider a service that creates a new database connection for every request.

Even if each individual query is fast, the application may incur unnecessary connection setup overhead and overwhelm the database under concurrent load.

Connection pools help reuse connections and place limits on concurrency.

The same principle applies to Redis clients and HTTP clients, subject to each client's connection-management model.

Connection reuse alone, however, does not solve every performance problem.

A pool that is too small may create queues and increase latency. A pool that is too large may overload the dependency. Requests that wait indefinitely for a connection can consume resources without making progress.

Timeouts, cancellation, retry policies, and connection limits should reflect the behavior and capacity of the dependency.

The application should also distinguish between connection failures, timeouts, and application-level errors because they may require different recovery strategies.

Understanding networking helps developers reason about the complete request path rather than treating every delay as a slow function.

## Process behavior and graceful shutdown

A Node.js application is also an operating-system process.

That process can receive termination signals, encounter uncaught failures, run out of memory, or be restarted by its process manager or container platform.

These events matter for HTTP servers and background workers alike.

A graceful shutdown strategy should allow the application to stop accepting new work, finish or safely interrupt in-flight operations where possible, close connections, and release resources.

For a background worker, this may also involve stopping the acquisition of new jobs and allowing active jobs to finish within a defined shutdown period.

The implementation depends on the framework, queue library, deployment platform, and required shutdown guarantees.

A process that exits cleanly during development may still lose in-flight work if production shutdown behavior has not been considered.

This is another reason runtime knowledge extends beyond JavaScript syntax.

It includes understanding how the application behaves throughout its lifecycle.

## Framework knowledge is not enough

A senior Node.js engineer should understand what happens beneath the framework abstraction.

That is why I have been expanding my learning beyond controllers and services into:

- Event-loop behavior.
- Asynchronous execution.
- Streams.
- Networking.
- Memory.
- Worker threads.
- Process behavior.
- Performance measurement.

These topics are connected.

A slow endpoint may be waiting on a database, competing for a connection, performing synchronous CPU-heavy work, or buffering too much data.

A memory problem may originate in a cache, a stream pipeline, or the accumulation of objects retained by a long-running process.

A worker may be processing jobs correctly but still reduce API responsiveness if both workloads compete for the same CPU and memory resources.

Understanding the runtime helps narrow these possibilities before introducing unnecessary architectural complexity.

## Measure before optimizing

Runtime knowledge becomes most useful when combined with measurement.

Performance problems should be investigated using evidence rather than assumptions.

Useful measurements include:

- Request latency, including percentiles such as p95 and p99.
- Throughput and error rates.
- Event-loop delay and utilization.
- CPU and memory consumption.
- Garbage-collection behavior.
- Database connection-pool saturation.
- External dependency latency.
- Stream throughput and buffering.
- Background-job processing time and queue depth.

[Node.js](https://nodejs.org) provides diagnostic and profiling capabilities, including performance hooks, CPU profiling, heap snapshots, and event-loop monitoring.

The right tool depends on the symptom being investigated.

For example, high event-loop delay may suggest that the JavaScript thread is spending too much time executing callbacks or performing synchronous work. It does not, by itself, identify the exact cause.

CPU profiles, heap snapshots, traces, and application metrics help establish what is actually happening.

The same principle applies to optimization.

An architectural change should address an observed bottleneck or a clearly defined reliability requirement.

Adding worker threads, Redis, additional processes, or more complex streaming infrastructure without understanding the problem can increase operational complexity without improving the system.

## Final thought

Framework knowledge helps us build applications.

Runtime knowledge helps us understand why those applications behave the way they do.

That distinction becomes increasingly important as systems become more demanding.

As backend engineers, we should understand not only how to structure services and expose APIs, but also how the runtime executes work, manages resources, coordinates asynchronous operations, and responds to failure.

The framework is an important part of the application.

It is not a substitute for understanding the platform on which the application runs.
