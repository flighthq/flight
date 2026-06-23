# Dependency Alignment: @flighthq/timeline

**Verdict:** Clean — declared deps are minimal, correct, and predictable from the package's purpose; no violations found beyond what `npm run packages:check` already passes.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/sdk` | Not imported anywhere (barrel import correctly avoided). | — |
| None | Inline cross-package types | None. All cross-package types (`MovieClip`, `Timeline`, `TimelineSource`, `DisplayObject`, `PartialNode`, etc.) come from `@flighthq/types`; only the local `createTimelineSource` `obj` argument is an inline structural literal, which is acceptable for a `*Like`-style input. | — |
| None | `@flighthq/displayobject` | Used at runtime in `movieClip.ts` (`createDisplayObjectGeneric`, `createDisplayObjectRuntime`, `getDisplayObjectRuntime`). A MovieClip is a DisplayObject-backed node, so this edge is predictable and correctly a real (non-`type`) dependency. | — |
| None | `@flighthq/signals` | Used at runtime (`createSignal`) for the opt-in `MovieClipSignals` group (`onEnterFrame`/`onExitFrame`/`onFrameConstructed`) — the canonical signal-group pattern. Predictable edge. | — |
| None | `@flighthq/types` | Header layer; type-only + value kinds (`EntityRuntimeKey`, `MovieClipKind`). Correct. | — |
| Info | `@flighthq/path` | Appears in `src/timeline.ts:16` but only inside a prose comment (the createPath/appendPath analogy), not an import — so not a phantom dependency. No action needed; noted only to preempt a false positive. | — |

Additional checks, all passing:

- `import type` is on its own dedicated lines, separated from value imports (`movieClip.ts` splits the type block from the `EntityRuntimeKey, MovieClipKind` value import). No mixed `import { type Foo, bar }`.
- `"sideEffects": false` is declared; no top-level side effects (no `registerRenderer`, no global mutation, no listeners at module scope).
- Workspace deps pinned to `"*"`.
- Layering respected: timeline depends down/sideways (displayobject node base, signals, types) and never reaches "up" into `render*` or `sdk`. No backend-to-backend edges.
- Tests import only `@flighthq/types` and local files — no extra/undeclared dep surface introduced by tests.

## Declared vs used

**Declared:** `@flighthq/displayobject`, `@flighthq/signals`, `@flighthq/types` (deps); `typescript` (dev).

- **Unused declared:** none. All three runtime deps are imported and used.
- **Phantom (used but undeclared):** none. Every `@flighthq/*` import resolves to a declared dependency (`@flighthq/path` is a comment, not an import).
