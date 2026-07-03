---
package: '@flighthq/entity'
updated: 2026-07-03
basedOn: ./review.md
---

# entity — Assessment

Sorted from `review.md` (solid, 92/100) and the direction session (2026-07-02). Four Decisions blessed. The package is feature-complete for its domain; the only approved work is a one-word description fix.

## Recommended

Strictly sweep-safe: within `@flighthq/entity`, no cross-package coupling, no design decision.

- **Drop "node" from `package.json` description.** Change `"Core entity/node/runtime data model and binding system"` to `"Core entity/runtime data model and binding system"`. Decision #4.

- **Migrate `guards.ts` warnings to `@flighthq/log`.** Chartered by the 2026-07-03 Decision. Replace both `console.warn` calls with `logOnce(key, LogLevel.Warn, data, 'entity')`; drop the `[entity]` prefix (the channel carries it); message convention per the diagnostics doc; the entity goes in the structured data record. Keep the enable/are pair unchanged. Update tests to assert via `createMemoryLogSink`. Adds a workspace dependency `entity → log` (guard module only).

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
