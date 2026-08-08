---
package: '@flighthq/keyboard'
updated: 2026-08-08
by: principal
---

# keyboard — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/keyboard/src/` and `packages/types/src/` on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **`SoftKeyboardEasingKind` is defined and has zero consumers.** All five constants live in
  `packages/types/src/SoftKeyboardEasingKind.ts` and are reached only by the two barrel re-exports
  (`types/src/index.ts:565`, `types/src/contract.ts:578`). `SoftKeyboardTransition` carries
  `durationSeconds` and `height` alone (`types/src/Keyboard.ts:9-12`), so nothing can consume a curve.
  Adding the field pulls an `@flighthq/easing` dependency into this package — a ruling, not a chore.
- **`SoftKeyboardResizeMode` and `SoftKeyboardStyleKind` are bare `string` aliases**
  (`types/src/Keyboard.ts:2`, `:5`), so neither setter is checked at compile time, and only two
  constants exist for each — `None`/`Body` (`:3-4`) and `Default`/`Dark` (`:6-7`). Native, Ionic, and
  Light modes have no constant. Open-versus-closed union is the underlying question.
- **Per-field keyboard attributes are unbuilt and unowned.** No `setSoftKeyboardType`,
  `setSoftKeyboardReturnKey`, `setSoftKeyboardAutoCapitalize`, `setSoftKeyboardAutoCorrect`, or
  `setSoftKeyboardSpellCheck` exists in `packages/`. They associate with a focused field, which is
  `@flighthq/textinput`'s domain; confirm the split before building either side.
- **No safe-area coordination.** `setSoftKeyboardSafeAreaInsetsEnabled` does not exist; a
  keyboard-aware layout has to combine `getSoftKeyboardHeight` with `@flighthq/device`'s
  `getSafeAreaInsets` itself. Cross-package design surface.
- **The public `.` lane exports `getSoftKeyboardInfo` but not its allocator.**
  `createSoftKeyboardTransition` is public and `createSoftKeyboardInfo` is contract-only
  (`keyboard/src/index.ts`, allocator at `keyboard.ts:70`), and the backend seam
  (`get`/`setSoftKeyboardBackend`, `createWebSoftKeyboardBackend`) is contract-only too, so no
  app-boundary consumer can install a native host backend. `power` and `device` share the shape.
- **`createSoftKeyboard` allocates all nine signals eagerly with no `enable*` gate**
  (`keyboard.ts:55-67`), where `createPower` leaves them null behind `enablePowerSignals`. One suite,
  two shapes.
- **The web backend never fires a will-phase.** `subscribe` emits `'did'` only, with a shared
  `transition` fixed at `durationSeconds: 0, height: 0` (`keyboard.ts:96-119`), so `onWillShow` /
  `onWillHide` / `onWillResize` are native-host-only signals. Intended, but it means the will/did
  split has no in-tree backend exercising it.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline claim checked out **false**:
  "four new type files (one concept per file per types-layout convention)" — only
  `packages/types/src/SoftKeyboardEasingKind.ts` exists; `SoftKeyboardTransition`,
  `SoftKeyboardResizeMode`, and `SoftKeyboardStyleKind` are declared inline in
  `types/src/Keyboard.ts:2-12`, and the `Native`, `Ionic`, and `Light` constants the entry listed were
  never written. Its companion concern — "`Keyboard.ts` re-exports sub-types, so the types appear
  twice in the index" — falls with it: `Keyboard.ts` carries no re-export lines. Rust items were
  dropped as unverifiable here (no `crates/` directory in this repo).
- **2026-06-25** — Multi-listener, priority, cancellation, rapid-burst, and re-entrant
  attach/detach tests added; `packages/keyboard/README.md` created.
- **2026-06-24** — Will/did signal pairs added (`onWill*` / `onDid*`) with the original
  `onShow`/`onHide`/`onResize` kept as did-phase aliases; `SoftKeyboardBackend.subscribe` now passes
  `(phase, transition)`.
- **2026-06-24** — `SoftKeyboardInfo` gained `x`/`y`/`width` so split and floating keyboards are
  expressible; `getSoftKeyboardHeight` added as the zero-alloc reader.
- **2026-06-24** — Resize-mode, style, accessory-bar, and scroll-assist delegates added as optional
  backend methods with sentinel fallbacks; the web backend integrates the Chromium VirtualKeyboard
  API when present, making `show()`/`hide()` real.
