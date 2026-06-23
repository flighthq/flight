# API Alignment: @flighthq/loader

**Verdict:** Mostly aligned — clean type sourcing, signals, and allocation verbs; the one real issue is the `ResourceLoad` vs `ResourceLoader` type-word inconsistency, plus a missing `dispose*` for the signal-holding entity.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| High | `queueResourceLoad`, `startResourceLoad` | The entity type is `ResourceLoader`, but these functions carry the type word `ResourceLoad` (a type that does not exist). The Design Constraints require the full, unabbreviated **type word**; the codebase pattern is `verb + FullTypeWord` (`addNodeChild`, `startApplicationLoop`, `queueSpritesheetAnimation`). `createResourceLoader` correctly uses `ResourceLoader`, so the package is internally inconsistent about its own entity name. | Rename to operate on the full type word, e.g. `startResourceLoader(loader)` / `queueResourceLoaderItem(loader, factory)` (or `addResourceLoaderItem`), matching `createResourceLoader`. |
| Medium | (missing) `disposeResourceLoader` | `ResourceLoader` owns three signals (`onComplete`, `onError`, `onProgress`) that callers connect to. Sibling signal-holding entities expose a teardown (`disposeApplication`, the interaction manager's `disconnectSignal` cleanup). There is no way to detach listeners / release the loader to GC, so the entity quartet is incomplete. | Add `disposeResourceLoader(loader)` that clears the signal registries (and ideally rejects/drops any unstarted queued items). |
| Low | `queueResourceLoad` (throw) | Throws `new Error(...)` when called after `startResourceLoad`. This is a precondition violation (API misuse), so a throw is defensible under the "throw only for programmer error" rule — but verify this is the intended contract vs. a sentinel/no-op, since queue-after-start is plausibly reachable in async UI flows. | Keep the throw if queue-after-start is truly misuse; otherwise return a rejected `Promise` (the function already returns `Promise<T>`, so a rejected promise is the natural sentinel and avoids a sync throw from an async-shaped API). |
| Low | `createResourceLoader` (internal cast) | Uses the `loader as ResourceLoaderInternal` cast pattern to attach private mutable state (`items`, `loaded`, `started`, `total`) onto the public entity. The CLAUDE map flags the `internal.ts` cast as a legacy approach and prefers runtime slots on the narrowest runtime tier. | Acceptable for a leaf package with no entity/runtime split, but note it diverges from the runtime-slot guidance; if `loader` gains a runtime object, move private state there. |

## Clean

- **Type sourcing:** `ResourceLoader` is imported from `@flighthq/types` (the header layer), not redefined inline. Internal-only shapes (`QueuedItem`, `ResourceLoaderInternal`) are correctly kept private.
- **`import type` hygiene:** `import type { ResourceLoader } from '@flighthq/types'` is on its own dedicated `import type` line; value imports (`createSignal`, `emitSignal`) are separate.
- **Allocation verb:** `createResourceLoader` correctly uses the allocating `create*` verb; no math/hot-path function masquerades with an allocating verb, and there are no `out`-param functions to alias-check.
- **Signals:** Multi-listener notification (progress/complete/error) uses `@flighthq/signals` as the conventions require, rather than ad-hoc callbacks.
- **Accessors/booleans:** No misused `get*`; no boolean returned from a `get*`; no boolean getter missing `has*`/`is*` (the package exposes no accessors).
- **Globally unique names:** `createResourceLoader`, `queueResourceLoad`, `startResourceLoad` do not collide with exports elsewhere in the SDK.
- **Side-effect-free:** `"sideEffects": false`; no top-level registration or mutable state — signals are created per-loader inside `createResourceLoader`.
- **Tests colocated** as `resourceLoader.test.ts` with `describe` blocks mirroring exported function names.
