# API Alignment: @flighthq/statusbar

**Verdict:** Strongly conformant — follows the platform command-capability seam pattern (`create*Backend`/`get*Backend`/`set*Backend` + flat command functions) faithfully; the only real issue is a verb/word mismatch between the public `setStatusBarColor` function and the `setBackgroundColor` backend method.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Medium | `setStatusBarColor` | The public function uses the word `Color`, but the backend method it delegates to is `setBackgroundColor` (and the doc comment + `StatusBarBackend.setBackgroundColor` both say "background color"). The seam vocabulary diverges across one concept within the same package, hurting verb/word consistency. Other public functions mirror their backend method 1:1 (`setStatusBarStyle`→`setStyle`, `setStatusBarVisible`→`setVisible`, `setStatusBarOverlaysContent`→`setOverlaysContent`). | Rename the public function to `setStatusBarBackgroundColor` to match the backend method and the documented concept, keeping the whole package on one word for one operation. |
| Low | `createWebStatusBarBackend` → `setBackgroundColor` | `packedRgbaToHexColor` drops alpha by deriving `#rrggbb` only. This is intended and documented, but `theme-color` accepts `rgba()`/`#rrggbbaa`; silently discarding the low 8 bits of the documented `0xRRGGBBAA` convention is a quiet lossy narrowing. Not a naming violation — flag for behavior review only. | Consider emitting `#rrggbbaa` (or note explicitly in the public `setStatusBarColor` doc that alpha is dropped, which it already partially does). No API change required. |
| Low | package surface (read side) | The package is write-only: no `getStatusBarStyle`/`getStatusBarVisible`/`isStatusBarVisible` readers exist. For a command-style capability this is consistent with siblings (`shell`, `clipboard` writes), so not a defect — noted only as a completeness/AAA observation, since native status-bar state can be queried on some hosts. | If host backends can report state, consider adding `is*`/`get*` readers later; out of scope for pure API-convention conformance. |

## Clean

- **Full, unabbreviated type word in every export.** All seven functions spell out `StatusBar` in full (`getStatusBarBackend`, `setStatusBarStyle`, `setStatusBarVisible`, `setStatusBarOverlaysContent`, `createWebStatusBarBackend`). No abbreviation of the type word.
- **Globally unique, self-identifying names.** Every root export leads unambiguously to the status-bar domain; no collision risk with other packages.
- **Command-capability seam pattern matches siblings exactly.** `createWebStatusBarBackend` / `getStatusBarBackend` / `setStatusBarBackend(backend | null)` is identical in shape to `clipboard`, `shell`, and `notification` — correct `create*`/`get*`/`set*` verbs, nullable backend reset to web default.
- **Accessor/verb discipline.** `getStatusBarBackend` is a true getter; `create*` allocates (returns a fresh backend object) as the verb promises; `set*` functions are imperative commands. No `get*` returning a boolean, no boolean reader needing `is*`.
- **Color convention honored.** `setStatusBarColor`/`setBackgroundColor` take a packed RGBA integer (`0xRRGGBBAA`), the SDK-wide convention — plain `number`, no wrapper color type.
- **Sentinels, no throwing.** Web backend guards `document === undefined` and `head === null` and returns silently; no exceptions thrown for expected-missing environment. No validation of unreachable invariants.
- **No top-level side effects.** Backend is lazily created in `getStatusBarBackend`; module-level `_backend` starts `null`. Consistent with `"sideEffects": false`.
- **Types layering.** `StatusBarBackend` and `StatusBarStyle` are defined in `@flighthq/types` (`StatusBar.ts`), not inline; `import type { StatusBarBackend, StatusBarStyle }` is on its own dedicated `import type` line. Only dependency is `@flighthq/types` (`"*"`), correct for this package.
- **`Readonly<T>` exemption correct.** All parameters are primitives (`number`, `boolean`, string-literal union `StatusBarStyle`) or the deliberately-mutable nullable `backend`; none require `Readonly<>`.
- **Source style.** Exported functions are alphabetized; module-private `_backend` and `packedRgbaToHexColor` sit at the bottom after the public API. Test file colocated as `statusbar.test.ts`.
