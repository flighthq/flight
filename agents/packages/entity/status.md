---
package: '@flighthq/entity'
updated: 2026-08-08
by: principal
---

# entity — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/entity/src/` on 2026-08-08. A file:line here is a claim
about this tree, not about a session. The package is 15 exported functions across six files.

- **The guard messages name a function that does not exist.** `enableEntityRuntimeGuards.ts:45`
  tells the caller to "Use `ensureEntityRuntime` or `attachEntityBinding`", and `guards.ts:10`
  and `:18` repeat the name in comments — but `ensureEntityRuntime` is exported nowhere in
  `packages/`. `attachEntityBinding` inlines the get-or-create itself (`binding.ts:7-11`), so the
  seam the diagnostic points at is unreachable.
- **`attachEntityBinding` has no paired teardown.** `binding.ts` exports only `attachEntityBinding`
  and `getEntityBinding`; there is no `detachEntityBinding` anywhere in `packages/`. Attach without
  detach is the asymmetry, and `dispose*`/`destroy*` are both absent at this tier too.
- **`getEntityBinding` papers over `undefined` with `?.`.** `binding.ts:14` calls `getEntityRuntime`,
  which non-null-asserts (`runtime.ts:11`, `source[EntityRuntimeKey]!`), then relies on `?.` to
  survive the case the assertion denies. Reading the slot directly is the honest form.
- **The guards are inert unless a caller wraps by hand.** `createEntity` (`entity.ts:4`) returns the
  raw object; nothing calls `createGuardedEntity` (`guards.ts:12`) or `createGuardedEntityRuntime`
  (`guards.ts:32`), in this package or any other. `enableEntityRuntimeGuards()` therefore installs a
  write guard that no proxy ever invokes.
- **`cloneEntity` and `stripEntityRuntime` have no callers.** Both live in `clone.ts` (`:9`, `:19`)
  and are referenced only by `clone.test.ts`. `stripEntityRuntime` is the canonical serializer strip
  path and there is still no serializer; `cloneEntity` has no stated consumer at all.
- **The public `.` lane is empty.** `index.ts` is the single line `export {} from './contract';`, so
  `@flighthq/entity` exports nothing to an end-user app — and `@flighthq/sdk`'s
  `export * from '@flighthq/entity'` (`packages/sdk/src/index.ts:39`) therefore contributes zero
  symbols to the barrel. Whether entity is deliberately contract-only is a lane ruling, not a
  mechanical fix; nothing in the tree records the intent.
- **`NodeRuntime` is not the empty base extension point AGENTS.md describes.** `types/src/Node.ts:22`
  extends `EntityRuntime` with ~20 fields including two interaction-subsystem slots. Recorded here
  because the Entity/Runtime doctrine is this cell's; the fix belongs to `node`/`interaction`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Most of the prior file described a
  surface that is not in this tree: it claimed `ensureEntityRuntime`, `detachEntityBinding`,
  `getEntityBindingAs`, `getEntityRuntimeBinding`, and `hasEntityBinding` as implemented, and
  claimed `getEntityBinding` had been fixed to read the slot directly. Four of the five functions do
  not exist in `packages/`, and `binding.ts:14` still uses the `getEntityRuntime(...)?.binding` form
  the entry said was removed. The TS↔Rust conformance thread also went — there is no `rust/` tree
  and no `agents/rust/conformance.md` in this repo, so the "documented in the conformance map"
  claims point at a missing file.
- **2026-06-25** — Dropped "node" from the `package.json` description; this package owns no node type.
- **2026-06-24** — Guard mode, clone/strip, and the binding accessors landed (largely since reduced).
