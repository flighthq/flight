---
package: '@flighthq/screen'
updated: 2026-09-08
basedOn: ./review.md
---

# screen — Assessment

Refreshed 2026-09-08 from the 2026-09-02 review and live source. Review scored 62/100, anchored on test stubs (27/29 describes existence-only) and `copyScreenInfo` entity runtime leak. Both are now resolved. 4 source files, 31 exported functions, 31 describe blocks, 49 test cases (up from sparse stubs). Score revised to 80/100.

## Directed

_None._

## Recommended

- **Fix per-call allocation in query functions.** Lines 121, 134, 176, 206 each create `const screens: ScreenInfo[] = []` per call. Pool or reuse for hot-path queries.
- **Update stale `status.md` Open section.** Three of four items reference pre-R3 line numbers for issues that moved to `host-web` after the R3 refactor. Only item 4 (no display-mode enumeration) still applies.

## Depth gaps

1. **No display-mode enumeration.** No `getScreenModes` or `getScreenNativeMode` exists. Applies to host backends post-R3.
2. **`_scratchPoint` shared mutable state.** Still at line 311. Low practical risk but reentrancy-unsafe.
3. **Web derivation of `monochrome`/`dpi`/`depthPerComponent`.** Sentinels still present (`dpi: -1`, `depthPerComponent: -1`, `monochrome: false`). Applies to host backends post-R3.
4. **Stable-id contract for `ScreenInfo.id` across hot-plug.** Applies to host backends post-R3.

## Backlog

- Late-subscribe + upgrade ordering — behavior-contract decision, delegated to host witnesses post-R3.
- Explicit scope ruling on `setScreenMode` — absent today; decide absent-on-purpose vs chartered-native.
- Rust `flighthq-screen` conformance verification — cross-tree.

## Landed

1. ~~**`getScreenNearestRect` with distinct semantics.**~~ Landed. Contains-else-nearest-center logic at `screen.ts:205-220`, 5 behavioral tests.
2. ~~**Remove structural divider comments in test file.**~~ Landed.
3. ~~**`copyScreenInfo` entity runtime leak.**~~ Landed. Now uses `stripEntityRuntime(src)` before `Object.assign`. Test verifies destination runtime preserved.
4. ~~**Test stubs → behavioral coverage.**~~ Landed. 49 tests across 31 describes; only 4 `initialize*` blocks remain existence-only. Coordinate converters, spatial algorithms, `getScreenById`, and signal attach/detach/dispose all have behavioral tests.

## Approved

- [2026-07-02 · blanket "platform integration suite sweep"] `getScreenNearestRect` implementation, test divider removal
