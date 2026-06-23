# API Alignment: @flighthq/screen

**Verdict:** Strong — the package follows the command-capability backend-seam pattern faithfully and obeys the naming, throw, and allocation conventions; only minor, mostly-documented tensions remain.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `getScreens` | A `get*` accessor whose out-param path **allocates** — it sets `out.length` and fills missing slots via `createScreenInfo()` (web backend line 30). The map reserves allocation for `create*`/`clone*`/`acquire*` and expects out-param helpers to be no-alloc hot-path writers. The enumerate-and-fill pattern is reasonable and documented (`Screen.ts` "missing slots are allocated"), but it blurs the verb/allocation contract. | Keep, but document the allocation explicitly at the export site (the doc comment already notes it on `getScreens`; mirror that note on the `ScreenBackend.getScreens` contract so the allocating behavior is part of the seam, not an implementation detail). No rename needed. |
| Low | `createScreenInfo` vs `getScreens` / `getPrimaryScreen` / `onScreenChange` | The entity type is `ScreenInfo`, but every query/event function uses the bare domain word `Screen` (`getScreens`, `getPrimaryScreen`, `onScreenChange`, `ScreenBackend`) while the constructor uses the full type word (`createScreenInfo`). This is internally consistent (domain noun for queries, type word for the allocator) and reads naturally, but is a mild asymmetry against the "full unabbreviated type word" rule — `getScreens` returns `ScreenInfo[]`, not a `Screen` type. | Acceptable as-is: `Screen` is the genuine domain noun and `ScreenInfo` is the record shape, so `getScreens` is not an abbreviation of a type name. No change recommended; flagged only for the record. |
| Info | `getScreens` / `getPrimaryScreen` return the same `out` | Returns the filled `out` (chaining style) rather than `void`. Geometry out-param helpers (`copyRectangle`, `setRectangle`) return `void` with `out` first. This is a deliberate, documented seam choice (`Screen.ts`: "return the same `out` … so callers can chain or read inline"), not drift. | None — keep; the divergence is intentional and recorded in the type contract. |

## Clean

- **Backend-seam verb set is exactly the sibling pattern.** `createWebScreenBackend` / `getScreenBackend` / `setScreenBackend` / `createElectronScreenBackend` (in `host-electron`) match `clipboard`, `device`, and `platform` 1:1 — same verbs, same `Backend | null` setter signature, same lazy web default in `getScreenBackend`.
- **Event-receive convention correct.** `onScreenChange(listener): () => void` returns an unsubscribe, matching the documented command-capability `on*` shape (and the map's named `onScreenChange`); delegates to `ScreenBackend.subscribe`.
- **No throws for expected-missing cases.** The web backend guards `window`/`window.screen` and returns zeroed/empty `out` in jsdom rather than throwing — correct sentinel discipline.
- **Out-param alias safety.** `fillWebPrimaryScreen` reads only external `window.screen` state before writing `out`; no read-after-write hazard.
- **Allocation verb is honest where it counts.** `createScreenInfo` is the sole allocator and is named `create*`; it returns a mutable `ScreenInfo` (correct — constructors return mutable values).
- **Cross-package types sourced correctly.** `ScreenBackend` and `ScreenInfo` are imported from `@flighthq/types` via a dedicated `import type {}` line; nothing is defined inline.
- **`get*` accessors are real accessors.** `getScreenBackend` returns the backend object; no boolean-returning `get*` misuse, and `isPrimary` on `ScreenInfo` correctly uses the `is*` boolean prefix.
- **Setter param is appropriately mutable.** `setScreenBackend(backend: ScreenBackend | null)` is not `Readonly`, which is correct — the backend is a stored, method-invoked live object, not data to be copied.
- **Barrel is a thin re-export** (`export * from './screen'`), single root entry, `"sideEffects": false`, no eager backend registration at module top level (lazy creation only in `getScreenBackend`).
