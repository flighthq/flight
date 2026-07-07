---
package: '@flighthq/geolocation'
status: partial
score: 35
updated: 2026-06-25
ingested:
  - status.md
  - source
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# geolocation — Review (merge gate: integration-b2824e3d8 → origin/main)

This is a **merge-gate** review of the incoming delta (head vs base under `incoming/integration-b2824e3d8/`), judged against the approved baseline `origin/main` (`eb73c3d74`). The baseline is the blessed floor and is not under review. Findings are grounded in `b2824e3d8:<path>` hunks of the delta and the `packages/geolocation/` slice of `changes.patch`.

## Verdict

**REJECT — the integration tree does not type-check.** The package half of a two-part change landed (`geolocation.ts` grew 143 → 247 lines: +5 exported functions and a richer web backend) but the `@flighthq/types` half it is written against was **dropped from this integration**. The new package source imports three types and calls four backend members that exist nowhere in the head tree. The package-side design is genuinely good and convention-clean; it is blocked purely by the missing types header. This is the same failure mode as `@flighthq/storage`, `@flighthq/shortcut`, and `@flighthq/clipboard` this cycle — a builder change (`incoming/builder-67dc46d64`) whose `types` hunk was lost in integration.

## The blocker — the types header is missing from the delta (standards 6, 7)

`b2824e3d8:packages/geolocation/src/geolocation.ts:1-8` imports:

```ts
import type {
  GeolocationBackend,
  GeolocationErrorReason,
  GeolocationPermissionState,
  GeolocationRequestOptions,
  GeoPosition,
  GeoPositionResult,
} from '@flighthq/types';
```

and the new web backend calls `getCurrentPositionResult`, `getPermission`, `subscribePermission` (`geolocation.ts:62-126`), reads `GeoPosition.floorLevel` (`geolocation.ts:24`, `:218`), and wires a third `onError` parameter into `watchPosition` (`geolocation.ts:127-139`, `:195-201`).

None of `GeolocationErrorReason`, `GeolocationPermissionState`, `GeoPositionResult`, the `floorLevel` field, or the new `GeolocationBackend` members (`getCurrentPositionResult`, `getPermission`, `subscribePermission`, the `onError` param) exist in the head tree:

- `head/packages/types/src/Geolocation.ts` is **byte-identical to base** (`diff` reports IDENTICAL); it still declares only the original 4-member `GeolocationBackend` and an 8-field `GeoPosition` with no `floorLevel`.
- `grep` over `head/packages/types/` returns **nothing** for any of the three new type names.
- `changes.patch` contains **no** `diff --git a/packages/types/src/Geolocation.ts` hunk — only the package source, test, and docs hunks.

Yet the carried-in `status.md` (added in this same patch) asserts a whole "### Types added to `packages/types/src/Geolocation.ts`" block listing exactly these symbols as done. That claim is **false against this head** — the honesty standard (7) fails: the status log describes a types change that is not in the tree it ships with. As shipped, `@flighthq/geolocation` imports nonexistent exports and the package (and anything that builds it) does not compile.

## What the delta gets right (would pass once the header is restored)

Judged on its own terms, the package-side change is well-shaped and convention-clean:

- **Composition / bedrock (1) — pass.** Acquisition-only; no geospatial math fused in. The new `getCurrentGeoPositionResult` is an additive explicit-data companion to the `null`-sentinel `getCurrentGeoPosition`, not a config-gated branch inside it (`geolocation.ts:144-152`). Permission query/request/subscribe are distinct flat functions, not a mode flag.
- **Naming (2) — pass for the delta's new surface.** `getGeolocationPermission`, `onGeolocationPermissionChange`, `isGeolocationAvailable`, `getCurrentGeoPositionResult` all carry the full `Geolocation`/`GeoPosition` stem and the right verb (`get*` / `is*` / `on*`). The pre-existing `watchGeoPosition` / `clearGeoWatch` `Geo*`-stem split is inherited from base (both functions are unchanged in name), **not** introduced by this delta, and is already tracked as charter Open direction #1 — so it is not a delta defect and is not a merge blocker.
- **Tree-shaking / bundle (3) — pass.** `package.json` is byte-identical to base (single `.` export, `sideEffects: false`, no new dependency). Module state stays lazy (`_backend`, `_emptyOptions`, `_noopUnsubscribe` at `geolocation.ts:203-205`); no top-level registration or listener.
- **Registry vs union (4) — n/a.** No `kind` family here; the swappable backend seam is the right abstraction.
- **Subject triad (5) — n/a.** No format/backend split; the web backend correctly lives in-package behind `createWebGeolocationBackend`.
- **Contract hygiene (6) — strong where it compiles.** Sentinels throughout (`null`, `false`, `-1`, `'prompt'`, no-op unsubscribe), never throws on expected failure; `Readonly<>` on every options parameter; `try/catch` guards around every web API touch (`geolocation.ts:35-139`). `out`-params are n/a (async acquisition, not hot-loop math). The one contract failure is types-first: the types are referenced but absent (the blocker above).
- **Tests (7) — colocated, alphabetized, mirror exports.** `geolocation.test.ts` (251 lines) covers all 12 exports with describe blocks in source order, including the sentinel paths and the new `onError`/`getCurrentPositionResult`/`subscribePermission` surface. The tests are honest about jsdom (`isGeolocationAvailable` expected `false` at `:178`, result `reason` `'unavailable'` at `:143`). They will not run until the types exist.

## Minor (non-blocking, fold into the unblock pass)

- **`floorLevel` is structurally present but never populated.** `mapWebPosition` writes `floorLevel: 0` unconditionally (`geolocation.ts:212-225`) and never reads `coords.floorLevel`. This is honest "zeroed-when-unknown" per the type doc and lib.dom does not yet type the field, so it is correct as-is — a tracked follow-up (charter Open direction #6), not a fix.
- **`subscribePermission` attach-race.** The listener is wired only after `permissions.query()` resolves (`geolocation.ts:104-126`), so a change in that window is missed. Acceptable as a documented Permissions-API limitation; surfaced as charter Open direction #8.

## Where the admin docs need revising

- The Package Map line for `@flighthq/geolocation` still reads "current position and position watches"; the delta widens the cell to also own the full permission lifecycle (query / request / live change) and a synchronous availability probe. The map line should widen (charter Open direction #9) — a doc change behind the user's gate, not an autonomous edit.
- `status.md` must not assert the types as landed while the integration tree lacks them. The integration worker must either restore the types hunk or correct the status log; the two must agree.

## Score

35/100. The package-side craft is solid-tier work (it would score ~80 reviewed in isolation), but a merge gate scores the tree that would land, and **this tree does not compile**. The score rises to solid the moment the `@flighthq/types` Geolocation header is restored to match what the package imports.
