---
package: '@flighthq/entity'
updated: 2026-09-07
basedOn: ./review.md
---

# entity — Assessment

Sorted from `review.md` (solid, 92/100) and the direction session (2026-07-02). Four Decisions blessed. The package is feature-complete for its domain; the only approved work is a one-word description fix.

## Directed

1. **~~Track the proposed `create*` Entity convention as an advisory.~~** — retired 2026-09-07. The allocate-initialize-finish model (`allocateEntity` → `initialize*` → `finishEntity`) is now the strict ruleset with 1,808 `finishEntity` usages across the codebase. `npm run construction:check` enforces pairing as a CI gate; `npm run entity-contracts:check` audits the Entity return shape. The convention is enforced, not advisory.
2. **~~Make the migration semantic rather than a cast or verb-table exercise.~~** — retired 2026-09-08. The uniform Entity construction model is retained for all `create*` products, including pure data descriptors (adjustments, effects, projections, PBR extensions, physics configs/results, sensor readings). The null runtime slot cost is trivial (one pointer), and the single-constructor discipline enforces V8 hidden-class monomorphism at kind-dispatched hot paths — a measured benefit that outweighs the per-descriptor overhead. No `*Like` input seam exists for these types, so consumers already depend on the concrete constructor. `npm run entity-contracts:check` and `npm run construction:check` enforce the convention as CI gates.

## Recommended

Strictly sweep-safe: within `@flighthq/entity`, no cross-package coupling, no design decision.

- **~~Drop "node" from `package.json` description.~~** — retired 2026-08-05. The manifest now describes the package as the "Core entity/runtime data model and binding system"; the node-domain word is gone.

- **~~Migrate `guards.ts` warnings to `@flighthq/log`.~~** — retired 2026-08-05. `enableEntityRuntimeGuards.ts` installs the guard reporter and routes distinct runtime-slot and binding-slot warnings through `logOnce` at `LogLevel.Warn`; memory-sink tests cover both, the core guard module stays logger-free behind the seam, and the manifest declares the log dependency.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Audit `@flighthq/node` for inlined lazy-runtime logic.** `ensureEntityRuntime`/`hasEntityRuntime`/`detachEntityBinding` are now the functions every runtime-attaching subsystem should use. A quick audit of node to replace any inlined lazy-runtime logic is cross-package work.
- **Find/wire a caller for `stripEntityRuntime`.** The function is ready and tested, but no scene serializer exists to call it. The consumer lives in a future serialization package.
- **Guard mode review.** The `Proxy`-based guard mode needs review for alignment with SDK tenets. Charter Open direction #1.
- **Enrich the Package Map line in `index.md`.** Undersells the package now that it owns binding, clone/strip, and guards. Cross-cell doc edit.
- **Rust crate conformance.** Downstream conformance debt.

## Approved

- [2026-07-02 · picked] Drop "node" from `package.json` description — charter Decision #4
- [2026-07-03 · charter session] Migrate entity guard warnings to `@flighthq/log` — charter Decision 2026-07-03 (diagnostics)
