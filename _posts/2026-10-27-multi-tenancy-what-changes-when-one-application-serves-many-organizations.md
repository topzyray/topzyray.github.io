---
title: "Multi-Tenancy: What Changes When One Application Serves Many Organizations"
date: 2026-10-27 06:00:00 +0100
description: "Design multi-tenant applications with deliberate data isolation, trusted tenant context, tenant-aware authorization, and boundary testing."
categories:
  - SaaS
  - Backend Engineering
tags:
  - multitenancy
  - saas
  - nodejs
  - typescript
  - postgresql
---

Building software for one organization is different from building software that serves many organizations.

This distinction has become particularly relevant to me through work around school-management software.

When an application serves a single organization, many assumptions can remain implicit. Users belong to the same organizational environment. Configuration is relatively straightforward. Data access often assumes a single administrative boundary.

Those assumptions become dangerous when the same application serves multiple organizations.

A school-management platform, for example, may serve hundreds of schools, each with its own students, teachers, classes, academic sessions, billing arrangements, and administrative policies.

The application may share infrastructure, but the organizations using it must remain distinct in the ways that matter to the business.

That is where multi-tenancy becomes an architectural concern rather than just a database design decision.

## What is multi-tenancy?

A multi-tenant application serves multiple organizations while sharing the application infrastructure.

Conceptually:

```text
Application
   │
   ├── School A
   ├── School B
   └── School C
```

The challenge is ensuring that each tenant's data remains correctly isolated.

Sharing infrastructure can reduce operational overhead and make it easier to deploy, monitor, and maintain a common application. It can also allow improvements to be delivered consistently across organizations.

However, sharing an application does not mean sharing unrestricted access to its data.

Each tenant may have its own users, roles, configuration, records, and business rules. Some capabilities may be common to all tenants, while others may depend on the organization's subscription, policies, or enabled features.

A multi-tenant architecture must support these differences without allowing one organization's operations to interfere improperly with another's.

There are several common approaches to tenant isolation:

- **Shared database and shared tables:** Multiple tenants use the same tables, with a tenant identifier distinguishing their records.
- **Shared database with separate schemas:** Tenants share a database server but use separate database schemas.
- **Separate databases:** Each tenant has a dedicated database, providing a stronger separation boundary at the database level.

These approaches involve different trade-offs in cost, operational complexity, isolation, backup and restoration, and tenant-specific customization.

A shared database with tenant-scoped tables is often a practical starting point for a SaaS application. It is not automatically the right choice for every system, particularly where contractual, regulatory, or operational requirements demand stronger isolation.

The important point is to choose an isolation strategy deliberately rather than allowing it to emerge accidentally from the initial schema.

## Tenant context

A request should carry enough information for the application to determine its tenant context.

Conceptually:

```text
Request
 │
 ▼
Identity
 │
 ▼
Tenant
 │
 ▼
Authorization
 │
 ▼
Business Operation
```

Tenant context should not be treated as an optional detail.

It affects authorization and data access.

A user may belong to several organizations, so identifying the authenticated user is not always sufficient to determine which organization's resources the user is permitted to access.

For example, a teacher may work at two schools. A school administrator may manage one school, while a platform administrator may have a separate, explicitly authorized level of access.

The application needs to establish the active organizational context and verify that the authenticated identity is permitted to operate within it.

A request might include a tenant identifier in its route or headers, or the application might resolve the tenant from a verified domain or subdomain. Regardless of the mechanism, the supplied identifier should be treated as a request to select a context—not as proof of authorization.

For example:

```ts
type TenantContext = {
  tenantId: string;
  userId: string;
  membershipId: string;
  roles: string[];
};
```

This is an illustrative representation of the context established after authentication and membership verification. It should not be constructed by blindly trusting client-supplied role values or tenant identifiers.

A reliable request flow should:

1. Authenticate the identity.
2. Resolve the requested tenant.
3. Verify that the identity has an active membership or other explicitly authorized access to that tenant.
4. Establish the tenant context for the operation.
5. Enforce authorization and tenant-scoped data access.
6. Record relevant actions in the audit trail.

This context should be propagated consistently through the application layers that need it.

If controllers enforce tenant boundaries but repositories can execute unrestricted queries, the system still has a gap. If background jobs process tenant-specific records without carrying their tenant context, the same problem can reappear outside the HTTP request lifecycle.

Tenant context is therefore a cross-cutting application concern.

## Data isolation

A multi-tenant database design needs a clear strategy for separating tenant data.

A shared database can still provide logical tenant isolation, provided every relevant operation correctly applies tenant boundaries.

The dangerous situation is one where a developer can accidentally query data without tenant context.

Consider a simplified PostgreSQL table:

```sql
CREATE TABLE students (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `tenant_id` column identifies the organization that owns each record.

A tenant-scoped query should use that boundary explicitly:

```sql
SELECT id, full_name, created_at
FROM students
WHERE tenant_id = $1;
```

The value supplied to `$1` must come from the application's verified tenant context, not from an untrusted assumption about the requester.

The column alone does not guarantee isolation. A query that forgets the tenant predicate can expose records belonging to other organizations.

This is why tenant isolation should be reinforced at multiple levels.

**At the application layer**, repositories and data-access functions should require tenant context for tenant-owned operations. Avoid APIs that make unrestricted access the easiest default.

For example, a repository method that accepts a tenant identifier makes the ownership boundary explicit:

```ts
interface StudentRepository {
  findById(tenantId: string, studentId: string): Promise<Student | null>;
}
```

The implementation must apply both identifiers to the query. Merely adding `tenantId` to a method signature does not enforce isolation if the implementation ignores it.

**At the database layer**, PostgreSQL Row-Level Security (RLS) can provide an additional enforcement mechanism. Policies can restrict which rows a database role may read or modify based on a tenant context established for the database transaction or connection.

RLS must be configured carefully. The application role, table ownership, policy definitions, and connection-pool behavior all matter. For example, table owners and roles with certain privileges can bypass policies unless the design explicitly accounts for that behavior. A session-level tenant setting must also not leak between pooled connections or transactions.

**At the schema level**, constraints should prevent invalid relationships. If a student belongs to one tenant, a relationship between that student and another tenant's class should not be accepted merely because both record identifiers exist.

Composite keys or unique constraints involving `tenant_id`, together with appropriate foreign-key design, can help enforce these ownership relationships.

The objective is to make tenant isolation an invariant of the system rather than a convention that every developer must remember.

## Authorization must include tenant context

Authentication answers the question: who is making the request?

Authorization answers: what is that identity allowed to do?

Multi-tenancy adds another important question: within which organizational context is the action permitted?

A user may be authorized to view student records in School A but have no permission to view the same category of records in School B.

Even when both schools use the same application and database, their permissions must remain distinct.

This is particularly important for operations involving approvals, financial records, personnel information, and administrative configuration.

A useful authorization decision may depend on several factors:

- the authenticated identity;
- the active tenant;
- the user's membership in that tenant;
- the role or permissions assigned within that membership;
- the resource being accessed;
- the action being performed;
- any applicable business rules.

A global role such as `admin` is often too broad to express these distinctions safely.

The application should evaluate permissions in the context of the tenant and the requested operation. Tenant-specific authorization must also apply to resource identifiers: knowing a valid student ID, invoice ID, or requisition ID should not grant access to a resource belonging to another tenant.

This is one reason authorization should not be implemented solely by hiding buttons or links in the frontend. The backend must enforce the actual access rules.

## Roles can also be tenant-specific

A user may have a different role in different organizational contexts.

That means:

```text
User
 ├── Tenant A → Role X
 └── Tenant B → Role Y
```

For example, a user might be an administrator at one school and a teacher at another.

Representing these permissions as one global role would create ambiguity. Should the user receive administrator privileges everywhere, or only within the school where those privileges were granted?

A tenant-aware membership model makes the distinction explicit:

```text
User
  │
  ├── Membership A
  │      ├── Tenant A
  │      └── Role: School Administrator
  │
  └── Membership B
         ├── Tenant B
         └── Role: Teacher
```

A simplified relational design might include:

```text
User
 └── TenantMembership
        ├── userId
        ├── tenantId
        └── status

TenantMembership
 └── MembershipRole
        ├── membershipId
        └── roleId
```

In this model, the membership establishes the user's relationship with a tenant, and roles are assigned within that relationship.

The design can be extended to support permissions, invitations, membership expiry, and role changes without treating the user's identity as equivalent to their authority in every organization.

Platform-level administration can still exist, but it should be represented as a separate, deliberate authorization path rather than an accidental consequence of tenant membership.

The key is to distinguish the identity itself from the organizational permissions associated with it.

## Tenant isolation extends beyond database queries

Database queries are an important part of multi-tenancy, but they are not the only place where tenant boundaries can fail.

Consider the other components of a typical SaaS application.

**Caching:** A cache key that includes a resource ID but omits the tenant context may return one organization's data to another organization. Tenant-owned cache entries should include the relevant tenant scope where appropriate.

**Background jobs:** A queued job should retain the tenant identity required to process its work. A worker must not assume that the tenant context from an earlier HTTP request is still available.

**File storage:** Uploaded documents, profile images, reports, and exports need tenant-aware ownership and access checks. An unpredictable object-storage path is not a substitute for authorization.

**Search and reporting:** Search indexes, analytics queries, dashboards, and exports must preserve tenant boundaries. A correctly scoped API does not help if a reporting query aggregates records across organizations unintentionally.

**Logs and audit trails:** Tenant identifiers should be included where useful for traceability, while sensitive information should be handled according to appropriate logging and retention policies.

**Configuration:** Tenant-specific settings should be resolved within the active organizational context. One tenant's feature flags, branding, or business rules should not inadvertently affect another.

These concerns become especially important as the application grows. A new integration or background-processing feature can introduce a data-access path that bypasses assumptions enforced elsewhere.

Tenant isolation needs to be considered across the complete system, not just its primary database tables.

## Testing tenant boundaries

Multi-tenancy also changes what needs to be tested.

Testing whether a user can retrieve their own records is not enough. We must also test whether that user is prevented from accessing another tenant's records.

Useful scenarios include:

- a user cannot retrieve a record belonging to another tenant by changing its identifier;
- a user cannot update or delete another tenant's resource;
- a tenant administrator cannot administer a different tenant;
- a user with different roles in different organizations receives the correct permissions in each context;
- cache entries and background jobs preserve the correct tenant scope;
- invalid or missing tenant context is rejected where required;
- database constraints prevent cross-tenant relationships;
- tenant-specific exports and reports contain only authorized records.

These tests should exercise the actual authorization and data-access paths, including integration tests against the database where appropriate.

Where PostgreSQL RLS is part of the security design, its policies should be tested using the same database roles and transaction patterns used by the application. Tests run only as a privileged database owner may fail to reveal problems that affect the real application role.

The goal is to verify the boundary, not merely the successful execution of ordinary operations.

## Why this connects to my other work

The same architectural principles appear in enterprise systems:

- identity;
- organization;
- authorization;
- data boundaries;
- auditability.

The domain may change from schools to government offices, but the architectural questions are surprisingly similar.

In both cases, an identity operates within an organizational structure, and access depends on the relationship between that identity, the organization, and the requested resource.

A school-management platform may organize data around schools, classes, students, and teachers. An enterprise or government system may organize data around departments, offices, personnel, assets, and approvals.

The domain models differ, but both systems need to establish ownership, enforce contextual permissions, preserve traceability, and prevent one organizational unit from accessing another's data without authorization.

This is why I see multi-tenancy as more than a SaaS feature. It is an exercise in making organizational boundaries explicit and enforceable.

## Final thought

Multi-tenancy is not simply adding a `tenantId` column.

It is a system-wide data and authorization boundary.

That boundary must be reflected consistently across authentication, membership, authorization, database access, caching, background jobs, file storage, reporting, and testing.

A shared application can serve many organizations effectively, but only when the system makes it difficult for one tenant's operations to cross into another tenant's data unintentionally.

The objective is not merely to support multiple organizations.

It is to support them without compromising the isolation, integrity, and accountability each organization expects.
