---
package: '@flighthq/keyboard'
crate: flighthq-keyboard
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# keyboard — Charter

## What it is

On-screen (soft) keyboard integration — the platform-integration _event_ capability that reports the soft keyboard's visibility, height, and frame rect, emits will/did show/hide/resize signals over the lifecycle quartet (`create`/`attach`/`detach`/`dispose`), and exposes show/hide requests plus native-control extensions (resize mode, style, accessory bar, scroll assist) over a swappable web/native `SoftKeyboardBackend`. The web default integrates the Chromium VirtualKeyboard API with a `visualViewport` fallback.

This is explicitly NOT a physical-key input library. Per the package map the type is `SoftKeyboard`, deliberately "avoiding the DOM `Keyboard`"; raw key codes, modifiers, and IME composition belong to `@flighthq/input`. The line ends at the _global_ keyboard surface — per-field input traits that merely influence the keyboard (type, return-key, autocapitalize, autocorrect, spellcheck) sit at the `@flighthq/textinput` boundary, which is still unsettled (see Open directions).

## North star (proposed)

_Proposed — durable principles inferred from the design and the SDK-wide forks. Edit or replace with your own framing; none is blessed._

- **Event-capability cell shape, exactly.** Mirror the platform-suite event pattern precisely — the `create*`/`attach*`/`detach*`/`dispose*` quartet over an entity of signals, a single swappable `*Backend` with a lazy web default that is never null, flat free functions for commands and native-control reads. `dispose*` detaches to GC (no non-GC resource to `destroy*`). The cell is a faithful instance of the pattern, not a bespoke shape.
- **Web-default graceful degradation.** Every API guards `window`/`navigator`/`visualViewport`/optional-backend-method absence and returns a sentinel (`false` / `SoftKeyboardResizeNoneKind` / height 0) or no-ops rather than throwing. Native hosts add capability by filling optional backend methods; the web default omitting a control is the normal case, not an error.
- **Predict-then-commit timing is honest.** The will→did phase split models native keyboard animation faithfully: `will` carries the transition (duration, height) before the change; `did` commits the visibility edge and emits the resize. Apps can drive content motion off the will-phase prediction and reconcile on did.
- **Stay on the global-keyboard side of the line.** Own visibility, geometry, animation phases, and global controls; never reach into key events (`@flighthq/input`) or per-field traits (`@flighthq/textinput`). Narrow and well-bounded is the goal, not a stub — but the bound is a boundary, not a backlog.
- **`@flighthq/types`-first, dependency-light.** All shapes live in `types`; the package depends only on `signals` + `types` until a deliberate, blessed reason (e.g. easing wiring) adds more.

## Boundaries (proposed)

_Proposed — drawn from the review and neighboring packages. Edit before relying on these as rulings._

**In scope**

- Soft-keyboard visibility, height, and frame rect snapshot (`SoftKeyboardInfo`, `out`-param readers, zero-alloc height read).
- Will/did show/hide/resize signals and the lifecycle quartet.
- Show/hide commands and global native controls: resize mode, style, accessory-bar visibility, scroll-assist.
- The swappable backend seam: lazy web default (Chromium VirtualKeyboard + `visualViewport` fallback), native override/reset, `createWebSoftKeyboardBackend`.

**Non-goals**

- Physical-key input — key codes, modifiers, key events, IME composition. That is `@flighthq/input`.
- Per-field input traits (keyboard type, return-key, autocap/autocorrect/spellcheck) — these associate with a focused field and lean toward `@flighthq/textinput` (boundary unsettled — see Open directions).
- Safe-area inset reconciliation as an owned responsibility — coordination with `@flighthq/device` is cross-package and undecided.
- Host adapters themselves — concrete native backends are `host-*` packages registering against the seam, not code here.

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch this cell. An agent **asks** here rather than assumes._

- **Where does the keyboard↔textinput boundary fall? (highest-value decision.)** The review and depth review both lean: this package owns the _global_ keyboard; per-field input traits (`setSoftKeyboardType` / `setSoftKeyboardReturnKey` / `setSoftKeyboardAutoCapitalize` / `setSoftKeyboardAutoCorrect` / `setSoftKeyboardSpellCheck`) live in `@flighthq/textinput` and merely _influence_ the keyboard. Clean but unblessed. Settling it either unblocks the Gold field-attribute setters here or relocates them.
- **Is `SoftKeyboardEasingKind` in scope, and how does it wire?** The five easing kinds ship in `types` but are entirely unwired — `SoftKeyboardTransition` carries only `durationSeconds` + `height`, no `easing` field, and there is no kind→`@flighthq/easing` lookup. Wiring it adds an `easing` dependency to a currently `signals`+`types`-only cell. Confirm: in scope? add `easing` to the transition? and the kind-value namespacing below.
- **Open vs closed kinds (structural fork B at the type level).** `SoftKeyboardResizeMode`, `SoftKeyboardStyleKind`, and `SoftKeyboardEasingKind` are _closed_ string unions, yet `SoftKeyboardResizeMode.ts`'s own comment promises "hosts can register vendor-prefixed extensions (e.g. 'acme.custom')" — which the closed type forbids without a cast. Fork B's default is registry/open; the exception is a tight closed loop, which this is not. Resolve: widen to open (`string & {}`-style) host-extensible kinds, or drop the vendor-extension promise. A one-line Decision settles the drift.
- **Easing kind-value namespacing.** `SoftKeyboardEasingKind` values are bare generic strings (`'ease'`, `'easeIn'`, `'linear'`) — not `SoftKeyboard`-prefixed. If ever keyed into a shared `@flighthq/easing` kind registry they collide with easing's own vocabulary. Acceptable if the lookup stays package-local; decide before the easing wiring lands.
- **Safe-area / `@flighthq/device` coordination.** Is keyboard-aware safe-area inset adjustment (`setSoftKeyboardSafeAreaInsetsEnabled` / inset reconciliation) this package's job, `@flighthq/device`'s, or a consumer's? Cross-package; needs a ruling.
- **Duplicate type re-export surface.** The four sub-types are re-exported both from `types/src/Keyboard.ts` (line 72) and directly from `types/src/index.ts` (lines 363–366), doubling the four names in the `types` index. Harmless to `tsc` but worth picking one re-export site when the types-layout convention is next tightened.
- **Rust conformance timing.** The charter declares `crate: flighthq-keyboard`, but `crates/flighthq-keyboard` does not exist yet (the builder worktree has no `crates/`). The implementation is a clean 1:1 mirror (signals, info, backend trait, free functions, string-kind consts, will/did dispatch) awaiting a `rust`-worktree session. When?
- **Robustness coverage on multi-listener edges.** No tests yet for signal priority/cancellation across will/did edges, rapid show/hide bursts, or re-entrancy during emit. Is the platform-suite event-entity stress matrix expected here, or is single-listener coverage sufficient for this narrow cell?
- **Package Map line is understated.** `tools/agents/docs/index.md` still describes the cell as only "on-screen keyboard visibility/height." It now also owns show/hide, will/did phases, resize-mode/style/accessory-bar/scroll-assist, and a frame rect. Broaden the map line to match the actual control surface.
