# API Alignment: @flighthq/displayobject

**Verdict:** Strong, consistent alignment — naming, verbs, allocation, sentinels, and `Readonly` are all on-convention; the only real defects are two `compute*LocalBoundsRectangle` functions that leave `out` partially written on some paths, plus a stray mid-file import.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Medium | `computeBitmapLocalBoundsRectangle` | The `out` Rectangle is only written when `sourceRectangle !== null` or `image` is truthy. With no source rect and no image, `out.width`/`out.height` are left untouched, so a reused `out` keeps stale dimensions instead of reflecting the (zero-size) bitmap. An out-param compute helper should fully define `out` on every path. | Initialize `out.width = 0; out.height = 0` first (and `out.x`/`out.y` if the bounds convention sets them), then overwrite from the source rect/image when present. |
| Medium | `computeVideoLocalBoundsRectangle` | Same partial-write hazard: `out` is only written when `source.data.source?.element` is present; an absent element leaves stale `out.width`/`out.height`. | Write `out.width = 0; out.height = 0` before the element check, then overwrite when an element exists. |
| Low | `video.ts` `import type { MethodsOf }` (line 33) | A second `import type` sits after the exported functions instead of being grouped with the top-of-file type import. Violates the import-grouping/top-of-file Source Style and is asymmetric with the sibling files, which import `MethodsOf` in their single top type block. | Merge `MethodsOf` into the existing top `import type { ... } from '@flighthq/types'` line. |
| Low | `createDisplayObjectGeneric` param `createDisplayObjectRuntimeFactory` | The parameter is `create…Factory` for a value already typed `DisplayObjectRuntimeFactory<R>` — redundant doubling of "create"/"Factory", and asymmetric with the terse sibling param `createData` (also a factory). Minor naming polish, not a hard rule break. | Rename to `createRuntime` (mirrors `createData`) or `runtimeFactory`. |

## Clean

- **Full, unabbreviated type words everywhere.** `getDisplayObjectRuntime`, `computeStageLocalBoundsRectangle`, `setHtmlViewSize`, `getDisplayObjectStage` — no `DO`/`Obj`/`Rect` abbreviations; every name is globally self-identifying. Names are globally unique across the barrel.
- **Allocation discipline by verb.** `create*`/`create*Data`/`create*Runtime`/`createStageSignals` allocate; `compute*LocalBoundsRectangle` write into an `out` and do not allocate; `get*Runtime` return the existing reference. Correct split.
- **Sentinels, not throws.** `getDisplayObjectStage` returns `Stage | null`, `getStageSignals` returns `StageSignals | null`; no function throws for an expected-missing case, and there is no validation of unreachable internal invariants.
- **Accessor / boolean prefixes.** `get*` for accessors (`getBitmapRuntime`, `getDisplayObjectStage`), `is*` for the boolean type guard `isDisplayObject`. No `get*` returns a boolean.
- **Signal-group convention.** `enableStageSignals` (lazy `??=` opt-in) + `createStageSignals` + `getStageSignals` (sentinel) is the canonical `enable*`/`create*`/`get*` trio, with cost paid only on opt-in.
- **Teardown verbs.** No `dispose*`/`destroy*`/`release*` are exported from this package, so there is no synonym drift to flag (resource-freeing teardown lives in the renderer packages).
- **`Readonly<T>` usage.** `Readonly<DisplayObject>` etc. on read-only `source` params and `Readonly<...Runtime>` return types; mutators (`setStageSize`, `setBitmapImage`, `setDisplayObjectClip`, `setHtmlViewSize`, `setRenderViewSize`) deliberately take mutable `source`. `compute*` take `Readonly<Node>` source + mutable `out`. Const-by-default is honored.
- **`import type {}` on its own lines.** Top-of-file type imports are isolated `import type { ... }` blocks (no inline `import { type Foo, bar }`); cross-package types all come from `@flighthq/types`, none defined inline.
- **Parameter-order symmetry.** All `compute*LocalBoundsRectangle` are `(out, source)`; all `create*Data`/`create*Runtime` mirror each other; all `set*Size` are `(source, width, height)`. Consistent within the package.
