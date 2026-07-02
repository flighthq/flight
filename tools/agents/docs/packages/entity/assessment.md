---
package: '@flighthq/entity'
updated: 2026-07-02
basedOn: ./review.md
---

# entity — Assessment

Sorted from `review.md` (solid, 92/100) and the direction session (2026-07-02). Four Decisions blessed. The package is feature-complete for its domain; the only approved work is a one-word description fix.

## Recommended

Strictly sweep-safe: within `@flighthq/entity`, no cross-package coupling, no design decision.

- **Drop "node" from `package.json` description.** Change `"Core entity/node/runtime data model and binding system"` to `"Core entity/runtime data model and binding system"`. Decision #4.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Audit `@flighthq/node` for inlined lazy-runtime logic.** `ensureEntityRuntime`/`hasEntityRuntime`/`detachEntityBinding` are now the functions every runtime-attaching subsystem should use. A quick audit of node to replace any inlined lazy-runtime logic is cross-package work.
- **Find/wire a caller for `stripEntityRuntime`.** The function is ready and tested, but no scene serializer exists to call it. The consumer lives in a future serialization package.
- **Guard mode review.** The `Proxy`-based guard mode needs review for alignment with SDK tenets. Charter Open direction #1.
- **Enrich the Package Map line in `index.md`.** Undersells the package now that it owns binding, clone/strip, and guards. Cross-cell doc edit.
- **Rust crate conformance.** Downstream conformance debt.

## Approved

- [2026-07-02 · picked] Drop "node" from `package.json` description — charter Decision #4
