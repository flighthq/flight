---
id: <target>
title: '@flighthq/<target>'
type: new-package # new-package | depth
target: <target> # package short-name (no @flighthq/ prefix)
status: proposed # proposed | approved | building | done | superseded
tier: bronze # the tier currently scoped for build: bronze | silver | gold
source: # provenance — the review/maturation docs this was distilled from
  - tools/agents/docs/reviews/maturation/breadth/<target>.md
depends_on: [] # other proposals/packages that must land first
updated: <YYYY-MM-DD>
---

## Summary

<one paragraph: what this is and why it's worth building>

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

<types-in-@flighthq/types-first; the tiered plan below>

### Bronze

- …

### Silver

- …

### Gold

- …

## Boundaries

<what stays out / lives in neighbor packages>

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (new package: valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (new package) added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- <resolve before greenlighting>

## Agent brief

> Build `@flighthq/<target>` to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- <YYYY-MM-DD> — created.
