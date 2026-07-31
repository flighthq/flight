---
package: "@flighthq/picking"
updated: 2026-07-31
by: builder3
---

# picking — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-07-31 — builder3 type-honest empty hits

- Changed `Scene3DHit.node` from `Mesh` to `Mesh | null`, matching `createScene3DHit`'s real empty-state
  value and removing its `null as unknown as Mesh` cast.
- Hardened the five node-dependent surface-attribute queries: a fresh hit now returns `null`, `-1`, or
  `false` without mutating caller-owned output vectors instead of dereferencing null.
- Added runtime and type-level constructor assertions plus an empty-hit attribute-query regression.
- Mutation proof: removing the subset query's null guard fails the new regression with the expected
  null-geometry dereference.

Focused verification: `npm run test --workspace=packages/picking` passed 33 tests; `npm run check -- picking types`
passed typecheck, lint/format/order, 100% export coverage, type-home, and portability gates.
