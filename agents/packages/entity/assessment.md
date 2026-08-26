---
package: '@flighthq/entity'
updated: 2026-07-22
basedOn: ./review.md
---

# entity — Assessment

Sorted from `review.md` (solid, 92/100) and the direction session (2026-07-02). Four Decisions blessed. The package is feature-complete for its domain; the only approved work is a one-word description fix.

## Directed

1. **Track the proposed `create*` Entity convention as an advisory.** An Entity-valued `create*` can make the runtime and binding contract predictable, including for value-looking objects such as `Viewport`, while structural literals remain appropriate for explicit `*Like` inputs. This is design evidence rather than a repository invariant: a new public `create*` that returns another value must remain legal and must not block CI.
2. **Make the migration semantic rather than a cast or verb-table exercise.** The generated API currently
   exposes `create*` for structural products (`Scene3DDocument`, Standard PBR property blocks, projection
   descriptors), collections (`createScenesFrom*`), runtime records, backend descriptors, DOM elements,
   and native GL handles. Review each public function in its package context: some products should become
   Entities, while others need a more truthful operation name. `build*`, `compute*`, `parse*`, `allocate*`,
   and `compile*` are **not** approved blanket mappings from return shape to verb. Do not fake the convention
   by casting a browser-native `WebGLProgram` or an array to Entity. `npm run api:create-entity` audits the
   generated public barrels; `npm run api:create-entity:advisory` compares that inventory with the review
   baseline and reports changes without failing the command or blocking CI.

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
