---
package: '@flighthq/font'
updated: 2026-07-02
basedOn: status.md
---

# font — Assessment

Verified against the live tree (4 source files, 4 test files, 15 tests, 10 exports) and the direction session (2026-07-02). Five charter decisions blessed. No depth review exists — the package is new (extracted 2026-06-25).

## Recommended

Sweep-safe: within `@flighthq/font`, no open design decision beyond what the charter has blessed.

1. **DRY `inferFontFormat`.** Per charter Decision #3. Extract the duplicated `inferFontFormat` helper from `fontFrom.ts` and `fontResourceFrom.ts` into a shared internal module (e.g. `fontFormat.ts`). Both files import from it. Add a test file for the helper.

2. **Rename `*FromArrayBuffer` to `*FromBytes` and accept `Uint8Array`.** Per charter Decision #2. Change `loadFontFromArrayBuffer` → `loadFontFromBytes` and `loadFontResourceFromArrayBuffer` → `loadFontResourceFromBytes`. Change parameter type from `ArrayBuffer` to `Uint8Array`. Update barrel, tests, describe blocks. Run `npm run fix`, `npm run packages:check`, `npm run exports:check`.

## Backlog

- **Unify Font and FontResource.** _Parked — open direction._ Needs input from text/textlayout consumer perspective. Charter Open direction #1.
- **Breadth review for AAA completeness.** _Parked — no review exists._ Charter Open direction #2.
- **Rust `flighthq-font` crate.** _Parked — global posture._ Already exists from resources split.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: DRY inferFontFormat, ArrayBuffer → Uint8Array rename
