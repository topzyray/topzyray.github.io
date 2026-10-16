---
title: "Payments Are a Workflow, Not Just an API Call"
date: 2026-10-28 06:00:00 +0100
description: "Design payment processing as a recoverable workflow with verified outcomes, idempotency, separate financial records, and reconciliation."
categories:
  - Backend Engineering
  - SaaS
tags:
  - payments
  - paystack
  - nodejs
  - typescript
  - webhooks
---

A payment integration can look deceptively simple.

Call a payment provider.

Receive a response.

Mark the transaction successful.

Real payment systems are more complicated.

A payment involves external infrastructure, asynchronous communication, financial records, and business rules that must remain consistent even when something fails.

A request can time out after the provider has processed it. A webhook can arrive more than once. A customer can close the browser before the checkout process finishes. A payment can be completed externally while the application is temporarily unavailable.

These are not exceptional cases that can simply be ignored. They are normal conditions in distributed systems.

The challenge is not just initiating a payment. It is determining what happened, recording the outcome reliably, and ensuring that the rest of the application responds correctly.

## A payment is a workflow

A better mental model is:

```text
Initiated
   │
   ▼
Pending
   │
   ├── Successful
   ├── Failed
   └── Abandoned
```

The system needs to model those states.

In practice, the lifecycle may require additional states, such as `created`, `processing`, `expired`, `cancelled`, `reversed`, or `refunded`, depending on the provider and business requirements.

It is also important to distinguish a payment attempt from an order or purchase.

An order represents what a customer intends to buy. A payment attempt represents an attempt to collect the money for that order. One order may have several payment attempts if an earlier attempt fails or expires.

Treating these as separate concepts helps prevent retries from creating duplicate purchases or losing the relationship between the customer's intention and the financial transaction.

A simplified domain model might look like this:

```ts
type PaymentStatus =
  | "pending"
  | "successful"
  | "failed"
  | "abandoned"
  | "refunded";

type Payment = {
  id: string;
  orderId: string;
  providerReference: string;
  amountMinor: bigint;
  currency: string;
  status: PaymentStatus;
};
```

This is illustrative rather than a complete payment schema. A production implementation would also need to define valid state transitions, timestamps, provider identifiers, and any relevant refund or reconciliation records.

The key point is that payment status should represent a verified business fact, not merely the outcome of one HTTP request.

State transitions should also be controlled. A delayed failure notification, for example, must not blindly overwrite a payment that has already been verified as successful. Similarly, a refund should not be represented as if the original payment never occurred.

Financial workflows need explicit rules for how states change and which evidence permits each transition.

## Why the API response is not the entire story

External payment providers can communicate through callbacks or webhooks.

That means payment processing is distributed.

Our application and the payment provider are separate systems.

Neither system can assume that every message will arrive immediately, exactly once, or while the other system is available.

Consider a customer who initiates checkout. The provider processes the payment, but the response to our backend times out before the application receives confirmation.

The application now has an uncertain outcome.

If it immediately marks the payment as failed and starts another payment attempt, the customer could eventually be charged twice.

If it marks the payment as successful merely because the checkout request was accepted, the customer could receive a product without a completed payment.

The backend therefore needs to handle:

- duplicate notifications;
- delayed notifications;
- verification;
- inconsistent intermediate states.

It should also handle temporary provider outages, request timeouts, malformed messages, and events that arrive in an unexpected order.

A reliable design separates payment initiation from payment confirmation.

Initiating a payment means that the application has requested a payment operation. It does not necessarily mean that money has been received.

Similarly, redirecting a customer to a success page is not proof that the payment succeeded. The browser is controlled by the customer and cannot serve as the sole authority for a financial decision.

The backend needs a trusted way to establish the final payment outcome.

## Verify before granting access

For a provider such as Paystack, the backend should treat the provider's verified transaction status as evidence for deciding whether to complete the business operation.

The exact verification process depends on the provider's integration model, but it commonly involves verifying the transaction through a trusted server-side API or validating an authenticated webhook and checking the relevant transaction details.

The application should confirm that the transaction matches its own expected values, including:

- the provider reference;
- the expected amount;
- the currency;
- the associated order or purchase;
- the verified payment status.

The amount and currency are especially important. A successful transaction is not sufficient if it does not correspond to the amount and currency expected for the purchase.

For a webhook, signature verification must be performed according to the provider's documented requirements, using the unmodified request body where required. Invalid signatures should be rejected. Secrets should remain on the server and must not be exposed to the frontend.

A typical flow looks like this:

```text
Customer
   │
   ▼
Backend creates payment attempt
   │
   ▼
Payment provider
   │
   ├── Checkout response
   │
   └── Webhook / verification
              │
              ▼
       Verify authenticity
              │
              ▼
       Verify transaction details
              │
              ▼
       Record payment outcome
              │
              ▼
       Apply business effects
```

The browser redirect and webhook can both trigger a verification attempt, but neither should cause the application to bypass its own payment-state rules.

A useful principle is to separate the evidence received from the provider from the business decision made by the application.

The provider reports a transaction outcome. The application determines whether that outcome satisfies the conditions required to fulfil the associated order.

## Idempotency matters

If the same payment notification arrives more than once, processing it twice should not create two successful purchases.

The application needs a stable transaction identity and idempotent processing.

Duplicate delivery is a normal possibility in webhook-based systems. Providers may retry notifications when delivery fails or when they do not receive the expected acknowledgement.

A webhook handler should therefore be safe to execute more than once for the same event.

For example, the application can use the provider's transaction reference or event identifier to identify repeated processing attempts. Database uniqueness constraints can enforce important parts of that guarantee.

A simplified table might include:

```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    provider_reference TEXT NOT NULL UNIQUE,
    amount_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This illustrates how a unique provider reference can prevent duplicate payment records for the same reference. A production schema should also enforce valid statuses and appropriate relationships, and should define whether a provider reference is unique globally or within a provider account.

However, idempotency is not simply checking whether a row already exists.

The application must also handle concurrent processing. Two webhook deliveries could arrive close together, both observe a pending payment, and both attempt to apply the same business effect.

A robust implementation uses database transactions, appropriate uniqueness constraints, conditional state transitions, or row-level locking where necessary to prevent duplicate effects.

For example, marking an order as paid and recording the corresponding payment result should be coordinated so that a crash does not leave the system with a successful payment but no durable record of the resulting business decision.

Idempotency must extend beyond the payment row itself. If successful payment grants an examination subscription, creates an entitlement, or records a referral commission, repeating the payment handler must not grant that entitlement or commission twice.

The desired behavior is not necessarily that the handler runs only once.

It is that repeated processing produces the same valid business outcome.

## Keep financial records separate from business effects

A successful payment can trigger several operations:

- activating a subscription;
- granting access to an examination product;
- confirming an order;
- recording a referral commission;
- scheduling a payout;
- sending a receipt or notification.

These operations are related, but they are not the same thing.

The payment record captures the financial outcome. The entitlement or subscription records capture what the customer is allowed to use. Referral records capture commission eligibility and amounts. Payout records capture the movement of funds to a beneficiary.

Keeping these responsibilities distinct makes the system easier to audit and recover.

For example, if a payment is confirmed but subscription activation fails, the application should not lose the payment result simply because a downstream operation encountered an error.

The system needs a way to retry the failed business effect without charging the customer again or pretending that the payment itself failed.

This is one reason asynchronous processing and transactional outbox patterns can be useful.

The application can persist the verified payment outcome and the intent to perform downstream work in one database transaction. A worker can then process that work, using idempotent operations to handle retries safely.

This does not make every operation atomic across every system. It creates a durable path for coordinating work across system boundaries.

## Payment architecture

For systems such as the education products I have worked on, payment state can affect:

- access;
- subscriptions;
- examination products;
- referrals;
- payouts.

That means payment processing should not be treated as a small utility function.

It is part of the business workflow.

A practical architecture might separate responsibilities into components such as:

```text
Payments Module
   │
   ├── Payment Initiation
   ├── Provider Integration
   ├── Webhook Verification
   ├── Payment State Management
   ├── Reconciliation
   └── Refund Handling
           │
           ▼
    Business Workflows
           │
           ├── Entitlements
           ├── Subscriptions
           ├── Referrals
           └── Payouts
```

The exact module boundaries depend on the application, but the separation helps prevent provider-specific behavior from spreading throughout the business domain.

For example, a subscription module should not need to know how a specific provider signs webhook requests. It should respond to a trusted payment outcome or a clearly defined application event.

Similarly, the payment module should not assume that recording a successful payment means every downstream operation has already completed.

This separation also makes it easier to support another payment provider in the future without rewriting the business rules for subscriptions, entitlements, or referrals.

The objective is not to abstract every provider detail prematurely. It is to prevent external payment infrastructure from becoming inseparable from the application's business logic.

## Reconciliation is part of payment engineering

Webhooks and retries improve reliability, but they do not eliminate uncertainty.

A webhook might never be processed successfully. A temporary outage might leave a payment in a pending state. A local database update might fail after the provider has completed the transaction.

A payment system therefore needs a reconciliation process.

Reconciliation compares the application's payment records with the provider's transaction records and identifies discrepancies that require investigation or correction.

For example, a scheduled task might examine transactions that have remained pending beyond an expected period, query the provider for their current status, and update the local state when the result has been verified.

The process should be designed carefully. It should not blindly overwrite local records or repeat business effects without applying the same verification and idempotency rules used by webhook processing.

Useful operational metrics include:

- the number and age of pending transactions;
- webhook delivery and processing failures;
- verification failures;
- duplicate events;
- payment-to-entitlement delays;
- discrepancies discovered during reconciliation;
- refund and payout failures.

These measurements help distinguish a payment provider problem from an application processing problem.

They also make it easier to detect situations where the financial transaction succeeded but the customer has not received the expected product or service.

## Final thought

A payment provider gives us infrastructure.

The application still needs to model its own business state.

It must distinguish initiation from confirmation, verify the transaction, handle duplicate and delayed messages, protect against repeated business effects, and recover when part of the workflow fails.

That is why payment engineering is fundamentally a workflow-design problem.

The goal is not simply to process a successful payment.

It is to ensure that the payment, the financial record, and the business outcome remain consistent—even when the systems involved do not behave as expected.
