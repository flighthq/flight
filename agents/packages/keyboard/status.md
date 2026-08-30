---
package: '@flighthq/keyboard'
updated: 2026-08-30
by: builder
---

# keyboard — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/keyboard/src/` and `packages/types/src/` on
2026-08-30 after the direct host witness dispatch rewrite.

- **`SoftKeyboardResizeMode` and `SoftKeyboardStyleKind` are bare `string` aliases**
  (`types/src/Keyboard.ts:4`, `:7`), so neither setter is checked at compile time, and only two
  constants exist for each — `None`/`Body` (`:5-6`) and `Default`/`Dark` (`:8-9`). Native, Ionic, and
  Light modes have no constant. Open-versus-closed union is the underlying question.
- **Per-field keyboard attributes are unbuilt and unowned.** No `setSoftKeyboardType`,
  `setSoftKeyboardReturnKey`, `setSoftKeyboardAutoCapitalize`, `setSoftKeyboardAutoCorrect`, or
  `setSoftKeyboardSpellCheck` exists in `packages/`. They associate with a focused field, which is
  `@flighthq/textinput`'s domain; confirm the split before building either side.
- **No safe-area coordination.** `setSoftKeyboardSafeAreaInsetsEnabled` does not exist; a
  keyboard-aware layout has to combine `getSoftKeyboardHeight` with `@flighthq/device`'s
  `getSafeAreaInsets` itself. Cross-package design surface.
- **`createSoftKeyboard` allocates all three signals eagerly with no `enable*` gate**
  (`keyboard.ts:50-56`), where `createPower` leaves them null behind `enablePowerSignals`. One suite,
  two shapes. Three signals: `onShow`, `onHide`, `onResize`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Direct host witness dispatch rewrite (v3). Every operation takes `host: Has*`
  witness, direct dispatch `host.input.slot.operation()`. Zero ambient get/set/install/reset. Will/did
  signal pairs, `SoftKeyboardTransition`, `SoftKeyboardEasingKind`, and `createSoftKeyboardTransition`
  all deleted. Entity now has three signals (`onShow`/`onHide`/`onResize`). Subscribe returns typed
  `SoftKeyboardChangeSubscription` instead of nullable cleanup. `host-web` and `host-capacitor` no
  longer depend on `@flighthq/keyboard`. See `keyboard.ts` and `types/src/Keyboard.ts`.
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
