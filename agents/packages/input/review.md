---
package: '@flighthq/input'
status: solid
score: 62
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/input/src/inputManager.ts
  - head/packages/input/src/inputManager.test.ts
  - head/packages/types/src (InputSignals, InputGamepadData, InputKeyboardData, InputPointerData, KeyCode, KeyModifier, MouseWheelMode, index)
  - changes.patch (packages/input + packages/types slices)
  - charter.md (DRAFT)
---

# input — merge review (integration-b2824e3d8 vs origin/main eb73c3d74)

This is a **merge-gate** review of the incoming `@flighthq/input` change against the approved `origin/main` baseline. It judges only the delta (head vs base). The baseline is the blessed floor and is not under review. The bundled `review.md` carried in the same branch rates the package `solid`/84 — that score is fair for the **code in isolation against its intended types**, and most of this review agrees with it. The merge gate diverges on one axis the in-isolation review could not see: the delta does **not type-check against the `@flighthq/types` that this integration head actually contains.**

## Verdict: REVISE — strong package, non-mergeable as-is

The delta is a large, well-built expansion of the input surface: gamepad button/axis semantic naming (`getGamepadButtonName`/`getGamepadAxisName` + W3C standard-mapping tables), linear and radial dead-zone math (`applyGamepadAxisDeadZone`/`applyGamepadStickDeadZone`), a held-state snapshot + per-frame edge system (`InputState`, `createInputState`, `connectInputStateToInputManager`, `is*Down`/`get*`/`was*`, `endInputStateFrame`), a non-DOM key-repeat timer (`createInputKeyRepeatTimer`), pointer lock/capture (`requestInputPointerLock`/`exitInputPointerLock`/`hasInputPointerLock`/`set`/`releaseInputPointerCapture`), coalesced pointer events (`getCoalescedInputPointerEvents`), a richer pointer payload (pressure/tilt/twist/ size/timeStamp), event timestamps on keyboard and gamepad data, gamepad mapping-kind threading, and a much larger keycode table (F13–F24, media, browser, system keys, numpad-by-location). Composition is clean, naming is mostly canonical, tests are thorough and honest, and the surface is the right shape for the game-input layer the charter (DRAFT) anticipates.

It cannot merge in its current integration state because those additions lean on `@flighthq/types` shapes that the integration head's `@flighthq/types` **does not define or export**. The input package was advanced against a richer `types` than the one carried into this branch. As-is, the package fails `tsc -b`. This is a dependency-coupling failure, not a design failure — but it is a hard merge blocker.

## Standard-by-standard (delta only)

### 1. Composition / bedrock — PASS

The new surface decomposes into primitives rather than fusing features behind config flags. Dead-zone math is two pure leaves; the held-state snapshot is a separate value type (`InputState`) wired to the manager by an explicit `connect*` returning a disposer; the key-repeat timer is a standalone handle; pointer lock/capture are independent free functions. No within-unit config-gated-branch smell was introduced. The encoded-key packing for gamepad state (`gamepad * MAX_GAMEPAD_BUTTONS + button`) is a reasonable flat-key choice for the `Set<number>`/`Map<number,…>` held state and stays internal. `b2824e3d8:head/packages/input/src/inputManager.ts` L28–29, L329–343.

The event-stream vs. queryable-state split is arguably two jobs in one file, but bundling them at this size is defensible and the charter parks "normalization seam vs. full game-input library" as Open direction #1. Not a delta blocker.

### 2. Naming clarity — PASS with two nits

Full unabbreviated type words throughout; `get*`/`has*`/`is*`/`was*` used correctly (`hasInputPointerLock`, `isInputKeyDown`, `wasInputKeyPressed`). Two grounded inconsistencies, both minor:

- `getGamepadAxisName`/`getGamepadButtonName` drop the `Input` infix that the sibling `getInputGamepadAxis` carries — `getInput…` vs `getGamepad…` read as two families for one package. `b2824e3d8:head/packages/input/src/inputManager.ts` L562, L572, L581.
- Both take a bare `mapping: string` rather than the `GamepadMappingKind` the charter names (Open direction #6): `export function getGamepadAxisName(mapping: string, index: number)` — `b2824e3d8:head/packages/input/src/inputManager.ts` L562. A typed mapping-kind would make the `mapping !== 'standard'` guard self-documenting.

### 3. Tree-shaking / bundle invariant — PASS

`package.json` is byte-identical to base: single `.` export, `"sideEffects": false`, no new dependency. `index.ts` stays a thin `export * from './inputManager'`. No top-level side effects were added — listeners, timers, the `requestAnimationFrame` loop, and pointer-lock calls are all created inside `attach*`/`create*`/ `request*` bodies, never at module load. New module-scope constants (`_standardButtonNames`, `keyCodesByCode`, the scratch payloads, the binding `WeakMap`) are inert data. Each new function is independently importable; no shared hot-loop branch or shared switch now taxes existing importers. `b2824e3d8:head/packages/input/package.json` (unchanged); `…/src/inputManager.ts` L106–119, L823–851, L1091–1117.

### 4. Registry vs closed union (fork B) — N/A for the delta (parked)

No closed `switch(kind)` over a growing family was added. The gamepad standard-mapping tables are fixed-index lookup arrays — the correct shape for the genuinely-bounded W3C standard mapping. `GamepadMappingKind` remains a closed `'standard' | 'raw' | ''` union (charter Open direction #6), a pre-existing shape question not introduced or worsened by this delta. No action at the gate.

### 5. Subject triad + plurality guard — N/A for the delta

The delta adds no `-formats`/`-backend` cell and no premature split. The proposed neighbor packages (`input-bindings`, `gestures`, `gamepad-mappings`) are charter Open directions, correctly **not** acted on here. The standing structural tension — every `attach*` still takes a raw DOM target, so "portable, backend-agnostic" is aspirational rather than seam-enforced (charter Open direction #2, fork D) — is unchanged by this delta and belongs to a direction session, not this gate.

### 6. Contract hygiene — FAIL (merge blocker) + minor gaps

**Types-first is violated against the integration head.** The contract requires cross-package types to be defined in `@flighthq/types` first, then implemented against. The delta implements against types the integration head's `@flighthq/types` does not contain. Concretely, `b2824e3d8:head/packages/input/src/inputManager.ts` imports and uses, but head `@flighthq/types` does **not** define/export:

- `GamepadAxisKind`, `GamepadButtonKind` (value constants + types) — imported L2–23, used L562–575, L824–851. `grep -rn "GamepadAxisKind|GamepadButtonKind" head/packages/types/src` → no match.
- `InputState` — imported L2–17, returned by `createInputState` L472, threaded through ~10 functions. Head `types/src/index.ts` exports `TextInputState`, not `InputState`.
- `InputTextData` — imported L2–17, the new `onTextInput`/`onTextEdit` payload (`{ isComposing; text }`), L249–264, L1081–1084. Head `InputSignals` types those signals as `Signal<(data: Readonly<TextSelectionRange>) => void>` (`b2824e3d8:head/packages/types/src/InputSignals.ts` L20–21), and the test reads `data.isComposing` (`…/inputManager.test.ts` L255), a field `TextSelectionRange` lacks. Mismatch on assignment and on read.
- `InputKeyRepeatOptions` — imported L10, the `createInputKeyRepeatTimer` parameter L413. Not in head types.

**Field-shape mismatches** compound it — the delta writes fields the head type interfaces do not declare:

- `setInputKeyboardData` writes `out.timeStamp` (`…/inputManager.ts` L791) but head `InputKeyboardData` has no `timeStamp` (`b2824e3d8:head/packages/types/src/InputKeyboardData.ts`). The test asserts it (`…/inputManager.test.ts` L160–172).
- `pollGamepadInput` writes `_axisData.timeStamp`/`_buttonData.timeStamp` (`…/inputManager.ts` L662, L674) but head `InputGamepadAxisData`/`InputGamepadButtonData` have no `timeStamp` (`b2824e3d8:head/packages/types/src/InputGamepadData.ts`).
- `onGamepadConnected`/`onGamepadDisconnected` write `_connectData.mapping` (`…/inputManager.ts` L89, L101) but head `InputGamepadConnectData` is `{ gamepad; id }` only — no `mapping`.
- `setInputPointerData` and the `_pointerData` literal write `height`, `pressure`, `tiltX`, `tiltY`, `twist`, `width`, `timeStamp` (`…/inputManager.ts` L806–818, L1057–1079) but head `InputPointerData` declares none of them (`b2824e3d8:head/packages/types/src/InputPointerData.ts`). The test asserts `pressure`/`tiltX` (`…/inputManager.test.ts` L196–211).

The patch **does** touch `packages/types/` (8 files: FontMetrics, GlyphExtents, Notification, RenderViewport2D, ShapedRun, SpritesheetFormat, TextShaper, index) but **none** is an input type file — the input type shapes were left at base while the input implementation moved forward. This is the single decisive merge blocker: `tsc -b` cannot pass on this integration head.

Where contract hygiene is **met** by the delta (kept specific, not a blanket fail):

- Out-param alias-safety: `applyGamepadStickDeadZone` reads `x`/`y` into `mag` before writing `out.x`/`out.y`, is documented alias-safe, and the test exercises the aliased case (`…/inputManager.test.ts` L90–95). PASS.
- Sentinels over throws: `getGamepad*Name` return `null` off-standard/out-of-range; `requestInputPointerLock` resolves `false` on rejection; `releaseInputPointerCapture` swallows the already-released `DOMException`; disabled managers short-circuit. No new throw-on-expected-failure. `…/inputManager.ts` L563–574, L693–719.
- `dispose`/`destroy`: `connectInputStateToInputManager` returns a detach-and-release-to-GC disposer (correct `dispose`-semantics, though returned as a bare `() => void` rather than a named verb); no GPU/native resource, so `destroy*` is correctly absent. L379–391.
- Internal `Symbol()` binding keys (`kGamepadInput` …) are never serialized — contract-sanctioned. L1110–1115.

Minor, non-blocking: `createInputKeyRepeatTimer` returns an inline anonymous `{ start; stop }` object type rather than a named handle type in `@flighthq/types` (`…/inputManager.ts` L413–416). A named `InputKeyRepeatTimer` in types would match the header-layer rule and give the Rust port a seam to mirror.

### 7. Tests & honesty — PASS (in isolation)

One colocated `*.test.ts`, `describe` blocks alphabetized and mirroring exports, every new export tested (dead zones incl. alias case, frame edges, dispose, pointer lock/capture incl. throw-swallow, coalesced fallback + iteration, gamepad-name range/non-standard, key-repeat delay/interval/restart). Claims match code; no dead or unexported-but-implemented surface found. The honesty caveat is environmental, not authorial: these tests were green in the worktree where the richer `@flighthq/types` existed; on this integration head the file does not compile, so `tsc -b` (which typechecks `src/*.test.ts`) fails before the suite runs.

## Bottom line for the gate

Approve the **shape** of this delta — it is the right surface, cleanly built and honestly tested. Block the **merge** until the matching `@flighthq/types` additions land in the same integration so the package compiles. The fix lives outside `packages/input`'s own tree (it is a `@flighthq/types` change), which is why it is surfaced as a must-fix-before-merge directive and an Open-directions note rather than a within-package recommendation.
