---
title: "Migrating Complex Repository Relationships"
date: 2026-11-09 06:00:00 +0100
description: "Explore how to migrate relational repository queries carefully, preserve relationship semantics, and avoid hidden N+1 queries and partial-update problems."
categories:
  - Backend Engineering
  - Database Engineering
tags:
  - typescript
  - drizzle
  - prisma
  - postgresql
  - repositories
  - orm-migration
  - database-relationships
---

Migrating a simple database query is usually straightforward.

The complexity increases when a repository retrieves several related records and returns a structure that the application already depends on.

This is one of the areas I have been paying attention to while moving existing persistence code from Prisma to Drizzle.

The challenge is not simply retrieving the same table.

It is preserving the meaning and shape of the data the application expects.

## A repository may retrieve more than one entity

Consider a user-management feature.

A user may have relationships with:

- a role;
- permissions assigned through that role;
- an identity record;
- an office;
- a department.

The application may need this information together when building an authenticated user profile or evaluating access.

Conceptually:

```text
User
 │
 ├── Role
 │    └── RolePermissions
 │           └── Permission
 │
 ├── Identity
 │
 ├── Office
 │
 └── Department
```

A repository method that returns only the user table may not satisfy the actual application requirement.

The previous implementation may have retrieved several relationships in one query. The replacement must preserve the intended result without introducing unnecessary database round trips.

## Understand the existing query first

Before replacing a repository implementation, I want to understand:

1. Which records are retrieved?
2. Which relationships are required?
3. Which relationships are optional?
4. Are any records filtered by status?
5. Is ordering important?
6. Does the application depend on a particular result shape?
7. Are there authorization or data-ownership conditions?

This matters because two queries can look similar while returning different results.

For example, changing an optional relationship into an inner join can cause a user record to disappear when the related record is missing.

Likewise, a join can produce duplicate parent rows if the relationship is one-to-many.

The query must preserve the intended semantics, not merely compile.

## Joins and relationship loading

A relational database can retrieve related records through joins.

For example:

```sql
SELECT
  u.id,
  u.email,
  r.id AS role_id,
  r.name AS role_name,
  i.first_name,
  i.last_name,
  o.name AS office_name,
  d.name AS department_name
FROM app.users u
LEFT JOIN app.roles r
  ON r.id = u.role_id
LEFT JOIN app.identities i
  ON i.user_id = u.id
LEFT JOIN app.offices o
  ON o.id = u.office_id
LEFT JOIN app.departments d
  ON d.id = u.department_id
WHERE u.id = $1;
```

The use of `LEFT JOIN` means the user can still be returned when an optional related record is absent.

The correct join type depends on the relationship and the business requirement.

Drizzle provides SQL-like query builders for joins and relational queries. Its [select documentation](https://orm.drizzle.team/docs/select) is useful when translating existing query behavior.

## One-to-many relationships require care

The role-to-permission relationship introduces another consideration.

A user may have one role, but that role may have several permissions.

A join can return multiple rows for the same user:

```text
User  Role       Permission
----  ---------  ----------
U1    Admin      READ_USERS
U1    Admin      UPDATE_USERS
U1    Admin      APPROVE
```

The application may expect one user object containing a permissions array.

That means the repository must map the relational result into the required application structure.

```ts
interface UserProfile {
  id: string;
  email: string;
  role: {
    id: string;
    name: string;
    permissions: Array<{
      id: string;
      code: string;
    }>;
  } | null;
}
```

The repository owns the translation between the database result and the application-facing representation.

This is one reason I avoid exposing raw ORM result structures unnecessarily to use cases.

## Avoid accidental N+1 queries

A straightforward implementation might retrieve the user and then fetch each related record separately.

```ts
const user = await users.findById(userId);

const role = await roles.findById(user.roleId);

const permissions = await rolePermissions.findByRoleId(role.id);
```

This may be acceptable in a small workflow, but repeating the approach across collections can introduce an N+1 query problem.

For example, retrieving 100 users and then fetching permissions for each user may result in many additional database queries.

A join, relational query, or batched query may be more appropriate.

However, one large join is not always the best solution. Joining several one-to-many relationships can multiply result rows and increase the amount of data transferred.

The correct approach depends on cardinality, query plans, expected result size, and the shape required by the application.

The objective is not to minimize the number of SQL statements at any cost.

It is to retrieve the required data efficiently and predictably.

## Preserve optional relationships

Suppose a user does not yet have an identity record.

Should the repository return no user, or should it return the user with `identity: null`?

That is an application-level contract decision.

A careless migration can change this behavior simply by changing a `LEFT JOIN` to an `INNER JOIN`.

The same applies to office and department relationships.

Optionality should be explicit in both the database schema and the TypeScript result type.

```ts
interface UserProfile {
  id: string;
  identity: Identity | null;
  office: Office | null;
  department: Department | null;
}
```

The application can then handle missing relationships deliberately.

## Partial updates deserve attention

Another common issue during repository migration is updating only the fields supplied by the caller.

Consider:

```ts
const update = {
  firstName: input.firstName,
  lastName: input.lastName,
  phone: input.phone,
};
```

If some properties are `undefined`, the repository should not accidentally treat them as values that should overwrite existing data.

A helper can remove undefined fields:

```ts
function defined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
```

This is illustrative. The implementation should also consider whether `null` is a valid explicit instruction to clear a field.

There is an important distinction:

- `undefined` may mean the caller did not provide a value;
- `null` may mean the caller explicitly wants to clear a nullable field.

Collapsing these two meanings can introduce data-loss bugs.

## Do not confuse database models with application contracts

The database schema and the application model are related, but they are not necessarily identical.

A database record may contain internal columns that the application does not need.

An application profile may combine several tables into one useful representation.

The repository is a suitable place to map between these structures.

For example:

```ts
function toUserProfile(row: UserQueryResult): UserProfile {
  return {
    id: row.user.id,
    email: row.user.email,
    role: row.role
      ? {
          id: row.role.id,
          name: row.role.name,
          permissions: row.permissions,
        }
      : null,
    identity: row.identity,
    office: row.office,
    department: row.department,
  };
}
```

The exact mapping depends on the query result.

The broader point is that application services should not have to understand the database's join structure simply to obtain a useful user profile.

## Test the result, not only the query

A repository migration needs tests that verify behavior.

Useful cases include:

- a user with all relationships present;
- a user with an optional relationship missing;
- a role with multiple permissions;
- a role with no permissions;
- a missing user;
- a user with inactive or restricted related records;
- partial updates containing `undefined`;
- explicit clearing of nullable fields.

Integration tests against PostgreSQL are particularly useful for checking actual join behavior, constraints, nullability, and database-specific semantics.

A query that compiles successfully does not prove that it returns the same application data as the previous implementation.

## Final thought

Complex repository migration is not primarily about translating ORM syntax.

It is about preserving data relationships, optionality, result semantics, and application contracts.

The new implementation should retrieve what the application needs without introducing unnecessary queries or leaking database-specific structures into business logic.

This is why I prefer to understand the existing repository behavior before changing its implementation.

A migration is successful when the application continues to behave correctly and the new persistence layer is easier to understand and maintain.
