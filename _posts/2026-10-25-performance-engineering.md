---
title: "Performance Engineering: Measure Before You Optimize"
date: 2026-10-25 06:00:00 +0100
description: "Improve backend performance through representative benchmarks, meaningful baselines, and measurements that identify real system bottlenecks."
categories:
  - Backend Engineering
  - Performance
tags:
  - nodejs
  - performance
  - benchmarking
  - databases
---

Performance engineering is often presented as a collection of optimization tricks.

Use caching.

Use indexes.

Use queues.

Use clustering.

Use streams.

These can all be useful.

But none of them should be the first step.

The first step should be measurement.

Without measurement, we risk solving the wrong problem, introducing unnecessary complexity, or optimizing a component that contributes very little to the overall performance of the system.

A technique that improves one workload may have little effect on another. Some optimizations also introduce trade-offs involving memory, consistency, operational complexity, and failure handling.

The goal is not to make every component faster in isolation.

The goal is to understand how the system behaves under a defined workload and improve the parts that matter most.

## An assumption is not a benchmark

Suppose we believe an implementation is faster.

That is an assumption.

A benchmark gives us evidence.

A useful benchmark should define:

- what is being measured;
- the workload;
- the environment;
- the baseline;
- the change;
- the result.

It should also account for factors that can influence the result, such as warm-up time, concurrency, cache state, database state, network conditions, and background activity.

For example, comparing two API implementations using a handful of sequential requests may produce a different result from testing them under sustained concurrent traffic.

The first test might suggest that both implementations are fast. The second may reveal connection-pool exhaustion, increasing response times, or a growing queue of pending work.

The benchmark must reflect the question we are trying to answer.

If we want to know whether an implementation improves throughput, we should measure throughput under comparable conditions. If we want to know whether it improves the experience of individual users, we should pay close attention to latency.

A benchmark without a reliable baseline is difficult to interpret. A result without a repeatable process is difficult to trust.

## Measure the right thing

For backend systems, performance is not just requests per second.

Useful measurements can include:

- **Latency:** How long does a request or operation take?
- **Throughput:** How much work does the system complete within a given period?
- **Error rate:** How often do requests fail, time out, or return unexpected responses?
- **Memory usage:** How much memory does the process consume, and does that usage continue to grow?
- **CPU usage:** Is the application spending too much time performing computation?
- **Database time:** How much time is spent executing queries and waiting for database operations?
- **Queue delay:** How long does work wait before a worker begins processing it?
- **Resource saturation:** Are CPU, memory, database connections, file descriptors, or other resources approaching their limits?

These measurements answer different questions.

A system can have high throughput while individual requests experience unacceptable delays. It can also have low average latency while a small but important percentage of requests take several seconds to complete.

That is why latency percentiles matter.

Consider these common metrics:

- **p50:** The median request latency.
- **p95:** The latency at or below which approximately 95% of measured requests complete.
- **p99:** The latency at or below which approximately 99% of measured requests complete.

The p95 and p99 measurements can reveal slow requests that an average may conceal. They are particularly useful when a system has variable workloads, external dependencies, or occasional resource contention.

Error rate matters just as much. An implementation that processes more requests per second by rejecting or timing out more requests is not necessarily an improvement.

Performance measurements should therefore be interpreted together rather than in isolation.

## Establish a baseline first

Before changing an implementation, we need to understand its current behavior.

A baseline provides a reference point for evaluating whether an optimization actually helps.

For an API endpoint, that baseline might include:

- request latency at p50, p95, and p99;
- throughput at a defined concurrency level;
- error and timeout rates;
- CPU and memory consumption;
- database query duration;
- database connection-pool utilization.

The exact measurements depend on the system and the performance question.

It is also important to record the conditions under which the measurements were collected. Runtime versions, hardware, container limits, database configuration, dataset size, and request patterns can all influence the outcome.

For example, an endpoint tested against a database containing a few hundred records may behave very differently when the production database contains millions.

A baseline does not need to be complicated. It needs to be representative, repeatable, and sufficiently detailed to support a meaningful comparison.

## Measure the actual workload

A benchmark is only useful when its workload resembles the behavior we care about.

Consider an API that normally receives requests from many concurrent users. Testing it with one request at a time may hide contention and resource limitations.

A more representative test might account for:

- the number of concurrent users or requests;
- the proportion of reads to writes;
- typical and unusually large payloads;
- the size and distribution of database records;
- cache hit and miss rates;
- external service dependencies;
- bursts of traffic and sustained load.

It is also useful to distinguish between different types of performance tests.

A **load test** evaluates behavior under an expected workload. A **stress test** pushes the system beyond its expected operating conditions to identify its limits and failure behavior. A **soak test** sustains a workload over a longer period to expose issues such as memory growth, resource leaks, or gradual degradation.

These tests answer different questions. A single benchmark rarely answers all of them.

We should also avoid treating a short-lived peak result as proof of sustainable performance. A system may perform well for a brief period before its connection pools, memory limits, or downstream dependencies become saturated.

## Database performance

A slow API may not actually have a slow Node.js layer.

The database query may be the bottleneck.

That is why performance investigation needs to cross architectural boundaries.

```text
HTTP
 │
 ▼
Application
 │
 ▼
Database
```

Every layer can contribute to latency.

The total response time may include network overhead, request parsing, application logic, database connection acquisition, query execution, result processing, serialization, and response transmission.

If we focus only on the application code, we may miss the operation consuming most of the time.

For example, an endpoint that retrieves a list of requisitions might execute a separate query for every requisition to retrieve its items. As the number of requisitions grows, the number of database queries grows with it.

This is a common form of the N+1 query problem.

Adding more Node.js workers will not necessarily solve it. In some cases, it may increase database contention by allowing more concurrent queries to reach an already overloaded database.

A better investigation would examine:

- the number of queries executed per request;
- query execution plans;
- indexes and their effectiveness;
- the volume of data retrieved;
- unnecessary database round trips;
- connection-pool utilization;
- transaction duration and lock contention.

Tools such as PostgreSQL's `EXPLAIN ANALYZE` can help identify expensive query operations and show how a query actually executes. However, it executes the statement being analyzed, so it should be used carefully with statements that modify data.

The important point is that database performance should be measured at the database boundary, not inferred from API response time alone.

## Understanding Node.js performance

When the database is not the bottleneck, we need to investigate the Node.js runtime and application code.

Node.js is well suited to I/O-heavy workloads, but that does not mean every Node.js application is automatically fast.

CPU-intensive JavaScript can block the event loop. Large synchronous operations can delay unrelated requests. Excessive object creation can increase garbage-collection activity. Unbounded concurrency can overwhelm downstream services.

The appropriate response depends on the evidence.

For example:

- If CPU usage is high and the event loop is frequently blocked, investigate expensive computations and synchronous operations.
- If requests spend most of their time waiting for a database, investigate query execution, connection pools, and database capacity.
- If memory usage grows continuously, investigate retained objects, unbounded collections, and resource cleanup.
- If latency increases sharply under concurrency, examine resource contention, connection limits, queueing, and downstream saturation.

Node.js provides useful diagnostic capabilities, including CPU profiling, heap snapshots, and event-loop monitoring. These can help narrow down the cause of performance problems instead of relying on guesswork.

Profiling should generally be performed under a workload that reproduces the behavior being investigated. A CPU profile collected while the application is idle will not explain a CPU bottleneck that appears only under heavy traffic.

The objective is to connect an observed symptom to a specific cause.

## Optimize the bottleneck, not the architecture diagram

Once we identify a bottleneck, we can select an appropriate optimization.

Caching may reduce repeated database reads. An index may improve query execution. A queue may move non-critical work out of the request-response path. Streams may reduce memory pressure when processing large amounts of data. Worker threads may help with CPU-intensive JavaScript.

But each technique solves a different problem.

Caching introduces invalidation and consistency concerns. Indexes consume storage and add overhead to writes. Queues introduce delivery, retry, and idempotency considerations. Streams require correct backpressure handling. Worker threads introduce communication and lifecycle overhead.

Even clustering is not a universal solution. It can improve the use of multiple CPU cores for suitable workloads, but it does not automatically fix slow queries, inefficient algorithms, or overloaded external dependencies.

Before choosing an optimization, we should be able to explain:

1. What is the observed performance problem?
2. Which component or operation causes it?
3. Why should the proposed change improve that behavior?
4. What trade-offs could the change introduce?
5. Which measurements will demonstrate whether it worked?

These questions keep optimization tied to evidence rather than fashion.

## Benchmarking belongs in engineering

As I continue studying advanced Node.js, I want benchmarking to become part of the engineering process rather than something performed only when a system becomes slow.

The sequence should be:

```text
Measure
  ↓
Identify bottleneck
  ↓
Form a hypothesis
  ↓
Change
  ↓
Measure again
  ↓
Compare results
```

The comparison should use the same workload and sufficiently similar environmental conditions. Otherwise, we may attribute an improvement or regression to a code change when another variable actually caused it.

We should also retain the results of important performance investigations. A record of the baseline, hypothesis, change, and outcome helps the team understand why an optimization was introduced and whether it continues to provide value.

Not every optimization needs a dedicated benchmarking suite. Small, low-risk changes may only require focused measurements. Performance-critical paths, recurring workloads, and systems with strict latency or throughput requirements may justify automated benchmarks and regression checks.

The level of rigor should reflect the cost of getting the decision wrong.

Performance engineering is not about running benchmarks for their own sake. It is about making informed decisions and verifying their results.

## Final thought

Optimization without measurement is speculation.

Production performance engineering requires evidence.

The fastest-looking implementation is not necessarily the fastest under realistic conditions. The most sophisticated architecture is not necessarily the most efficient. And a successful optimization is not one that merely looks cleaner or more advanced.

It is one that produces a measurable improvement without introducing unacceptable trade-offs.

Measure first. Understand the bottleneck. Make a targeted change. Measure again.
