---
package: '@flighthq/entity'
updated: 2026-07-22
basedOn: ./review.md
---

# entity — Assessment

Sorted from `review.md` (solid, 92/100) and the direction session (2026-07-02). Four Decisions blessed. The package is feature-complete for its domain; the only approved work is a one-word description fix.

## Directed

1. **Enforce the repository-wide `create*` Entity invariant.** Every Flight `create*` that constructs an SDK object returns an `Entity` through the entity constructor path, including value-looking objects such as `Viewport`; this preserves internal shape enforcement and the still-load-bearing OOP binding layer. Structural literals remain reserved for explicit `*Like` inputs. Add a mechanical/API test capable of catching new constructor drift.
2. **Make the migration semantic rather than a cast exercise.** The generated API currently exposes
   `create*` for structural products (`SceneDocument`, Standard PBR property blocks, projection
   descriptors), collections (`createScenesFrom*`), runtime records, backend descriptors, DOM elements,
   and native GL handles. Entity-valued SDK objects keep `create*` and adopt `createEntity`; structural
   assembly/calculation uses `build*`, native GPU allocation/compilation uses `allocate*`/`compile*`, and
   collection-producing import operations use `parse*`/`build*`. Do not fake the invariant by casting a
   browser-native `WebGLProgram` or an array to Entity. Audit against the generated root API, not an
   import-grep, so re-exported constructor drift is finite and CI-enforceable.

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
