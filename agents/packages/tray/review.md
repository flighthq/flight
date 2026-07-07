---
package: '@flighthq/tray'
status: partial
score: 38
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/tray.md
  - source
  - changes.patch
  - charter.md
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# tray — Review (merge gate: integration-b2824e3d8 → origin/main)

Frame: this is a **merge-gate** review of the incoming delta only — `head` vs `base` under `incoming/integration-b2824e3d8/`, where `base` is the approved floor `origin/main` (`eb73c3d74`) and is **not** under review. Findings cite `b2824e3d8:<path>`. The charter is a stub (North star / Boundaries / Decisions / Open directions are all `TODO`), so design axes fall back to the codebase-map AAA standard and the platform-suite seam pattern.

Note on the score: the prior survey in this folder scored the _as-claimed_ surface `solid — 82`. That review read the implementation as if the `@flighthq/types/src/Tray.ts` header extension shipped with it. **It did not ship in this integration snapshot.** This review scores the delta _as it actually exists in the bundle_, which does not compile.

## Verdict

`partial — 38/100`. **REJECT as a merge into the approved baseline — the delta does not type-check.** The `packages/tray/` source was advanced (23 free functions, balloons, capabilities, geometry query, template/pressed icons, an animated-icon helper, a rich `TrayEventData` event payload) but the `@flighthq/types/src/Tray.ts` header that those functions are written against was **left out of the integration snapshot**. `head/packages/types/src/Tray.ts` is byte-identical to base (md5 `e36467db4319ca73b4f42c61d0ac3ae5`) and still carries the old 6-method `TrayBackend` and 3-member `TrayEventType`. The implementation imports types that exist nowhere in the bundle. This is not a design critique of good code — it is a broken integration: the cell is split across `packages/tray` and its `@flighthq/types` header, and only half of it was carried forward.

The design _intent_ visible in the source is sound and would score well once the header is restored; the merge-gate verdict is dominated by the compile break, which is disqualifying regardless of intent.

## The blocker — header/implementation split (does not compile)

`b2824e3d8:packages/tray/src/tray.ts:1-10` imports three types from the shared header:

```ts
import type {
  MenuItemTemplate,
  TrayBackend,
  TrayBalloonOptions,
  TrayCapabilities,
  TrayEventData,
  TrayIcon,
  TrayIconOptions,
} from '@flighthq/types';
import type { Vector2Like } from '@flighthq/types';
```

None of `TrayBalloonOptions`, `TrayCapabilities`, or `TrayEventData` is defined anywhere in head's `@flighthq/types` (`grep -rln` over `head/packages/types/src/` returns nothing). The header file the implementation needs, `b2824e3d8:packages/types/src/Tray.ts`, is unchanged from base — it still reads:

```ts
export type TrayEventType = 'click' | 'rightClick' | 'doubleClick';
// ...TrayBackend with only: create, destroy, setTooltip, setTitle, setContextMenu, subscribe
```

Yet `tray.ts` builds a backend implementing `displayBalloon`, `getBounds`, `getCapabilities`, `getTitle`, `getTooltip`, `isDestroyed`, `listIds`, `popUpContextMenu`, `removeBalloon`, `setIcon`, `setIgnoreDoubleClickEvents`, `setPressedIcon`, `setTemplate` and a `subscribe(listener: (event: Readonly<TrayEventData>) => void)` — **19 methods against a 6-method interface**. `tsc -b` fails on every one of these. The colocated test (`b2824e3d8:packages/tray/src/tray.test.ts:1-9`) imports the same missing types and will not typecheck either.

`changes.patch` confirms the gap: it contains hunks for `packages/tray/src/tray.ts` and `packages/tray/src/tray.test.ts` (and the four doc files) but **no hunk for `packages/types/src/Tray.ts`** — even though the patch's own embedded review prose (`b2824e3d8:agents/packages/tray/review.md`, line ~82327 of the patch) _claims_ "`TrayBackend` (19 methods)" and "`TrayEventType` (17 members)" were "extended there first". The claim and the shipped bytes disagree. The header extension is the missing half of this change.

## Axis-by-axis (judging the intended delta, blocker noted)

1. **Composition / bedrock — pass (intent).** The new surface is flat free functions delegating to the backend; no config-gated branches, no fused subjects. `startTrayIconAnimation` (`b2824e3d8:packages/tray/src/tray.ts:226-235`) is a documented thin helper over `setTrayIcon` + `setInterval` with caller-owned timer teardown — a reasonable convenience, though "does an icon animator belong in `tray` or in a timer/animation primitive?" is a fair Open-direction question, not a blocker.

2. **Naming — pass, one nit.** Names are full and self-identifying: `getTrayCapabilities`, `getTrayIconBounds`, `getTrayIcons`, `isTrayDestroyed`, `displayTrayBalloon`, `removeTrayBalloon`. The base `setTrayContextMenu` is renamed to `setTrayIconContextMenu` (`b2824e3d8:packages/tray/src/tray.ts:188`), tightening the type word — good, and pre-release latitude covers the rename. `popupTrayContextMenu` (`:166`) lowercases "popup" while the backend method is `popUpContextMenu`; defensible as one word, minor.

3. **Tree-shaking / bundle invariant — pass.** `package.json` keeps `"sideEffects": false` and the single `.` export unchanged (`b2824e3d8:packages/tray/package.json` is identical to base). No top-level side effects added; `WEB_CAPABILITIES` (`tray.ts:13-20`) is a module const and the `_backend` lazy singleton matches base and the platform-suite convention. No new hot-loop branch or shared switch taxes other importers.

4. **Registry vs closed union — n/a.** `TrayEventType` is an event-payload tag, not a renderer/handler kind family needing registration; the backend itself is already swappable via `setTrayBackend`. No fork-B violation.

5. **Subject triad + plurality — pass.** tray is a single platform-capability cell; the in-package web backend matches the suite pattern. No format/backend split is due at this plurality.

6. **Contract hygiene — mixed.**
   - Sentinels: correct throughout — web backend returns `-1`/`''`/`[]`/`null`/no-ops and never throws (`tray.ts:34-97`), and `createTrayIcon` maps `-1 → null` (`:24-27`).
   - `Readonly<>`: applied on object params (`Readonly<TrayBalloonOptions>` `:108`, `Readonly<Vector2Like>` `:166`, `Readonly<TrayIconOptions>` `:24`).
   - **Drift:** `getTrayIconBounds` returns an inline literal `Readonly<{ height: number; width: number; x: number; y: number }>` (`b2824e3d8:packages/tray/src/tray.ts:127-131`) instead of the shared `RectangleLike` (`head/packages/types/src/Rectangle.ts`). Tray geometry should reuse the header's rectangle type, not re-spell it.
   - **Types-first violated at the integration level** — see the blocker. The header is the design surface and it is the half that did not land.
   - Rust mirror: out of this package's edit scope, but the prior status notes `crates/flighthq-tray` is stranded at the pre-session surface — relevant to the authoritative bar, not to this merge gate.

7. **Tests & honesty — mixed.** Source exports (23) are alphabetized and the 23 `describe` blocks mirror them in order (`tray.test.ts`). But the `setTrayIgnoreDoubleClickEvents` block (`b2824e3d8:packages/tray/src/tray.test.ts:571-584`) exercises `backend.setIgnoreDoubleClickEvents` / `getTrayBackend().setIgnoreDoubleClickEvents` rather than the exported free function — so the free function `setTrayIgnoreDoubleClickEvents` (`tray.ts:211`) has a name-matching describe block but is never directly invoked by its own test. `exports:check` is satisfied by name; coverage is not. And the whole test file is moot until the header compiles.

## What the charter still owes

The charter remains a stub. Open-direction candidates surfaced by this delta: (a) whether `startTrayIconAnimation` is in-scope for `tray` or belongs to a timer/animation primitive; (b) whether the rich balloon/macOS-template/pressed-icon surface is the committed scope or an Electron-shaped maximalism to trim; (c) the `host-electron` native backend and the Rust mirror as the cross-impl completeness bar.
