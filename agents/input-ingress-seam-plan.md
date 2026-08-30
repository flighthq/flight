# Input ingress seam

_2026-08-27. Approved shape and implementation record. The 26-site listener-ingress slice is
implemented; later follow-ups are recorded below without rewriting its accepted P5 evidence._

## Measured slice

The slice was the complete `input-ingress` category in the P5 census: 13 DOM listener registrations
and their 13 removals in `packages/input/src/inputManager.ts`.

| Family | Registrations | Removals | Count | Preserved behavior |
| --- | --- | --- | ---: | --- |
| Gamepad | `gamepadconnected`, `gamepaddisconnected` | same two names | 4 | connection state, connect/disconnect delivery, polling-loop cancellation |
| Keyboard | `keydown`, `keyup` | same two names | 4 | key/code/location/modifier/repeat normalization and default-prevention policy |
| Pointer | `contextmenu`, `pointercancel`, `pointerdown`, `pointermove`, `pointerup` | same five names | 10 | pointer identity/type, buttons, pressure/contact geometry, coordinates, context-menu policy |
| Relative pointer | document `mousemove` | `mousemove` | 2 | source document routing with the exact source as detach identity |
| Text / IME | `beforeinput`, `compositionupdate` | same two names | 4 | committed text versus composing edits, including empty text |
| Wheel | `wheel` | `wheel` | 2 | delta mode and `passive: !preventDefault` registration policy |
| **Total** | **13** | **13** | **26** | |

The derived P5 line moved from:

```text
P5 outstanding=62 direct-dom=18 input-ingress=26 scratch-surface=18 webgpu-acquisition=0
```

to:

```text
P5 outstanding=36 direct-dom=18 input-ingress=0 scratch-surface=18 webgpu-acquisition=0
```

## Approved shape

- One process-global `InputIngressBackend` is selected independently of `Application`. It can serve
  many simultaneous sources and windows; selection is never stored per source and is never keyed by
  an application.
- `InputIngressSource` is an exported host-neutral object identity with no DOM members. Every backend
  operation receives that exact identity. Native hosts may use their own wrapper object.
- The backend exposes the existing six attachment families. Each receives the source, a normalized
  `InputIngressSink`, and options, then returns the release for that attachment.
- The existing `attach*Input`/`detach*Input` functions were broadened to `InputIngressSource`; there is
  no parallel DOM API. The explicit Web adapter alone validates a source as an event target or reads
  its owner document and translates browser events into normalized sink calls.
- Core records remain keyed by `(InputManager, exact source identity, input family)`, so one manager
  can bind several windows and detach one without affecting another.

All legacy DOM callers migrate through the broadened API. Keeping a second DOM-taking path would
require a permanent P5 allowlist for those registrations and removals, making the zero budget rot
instead of proving that every caller uses the seam.

The canonical ownership and cleanup doctrine is recorded once in
[`backend-lifecycle-ownership.md`](backend-lifecycle-ownership.md). The public ingress contract and
package records point there rather than maintaining another copy.

## Normalization and routing

The Web adapter retains the existing scratch-record writers and synchronous delivery model:

- keyboard key/code/location, modifiers, repeat, portable key code, and timestamp;
- absolute and relative pointer coordinates, identity, type, buttons, pressure, contact geometry,
  tilt, twist, and wheel mode;
- committed text and composition edits as distinct operations;
- gamepad connection identity/mapping plus the current axes/buttons used to seed polling state; and
- enabled-manager filtering and existing `preventDefault`/passive-listener behavior.

Two-window coverage attaches two distinct window identities to two managers and proves that each
window delivers only to its corresponding manager. A native identity the Web adapter cannot
interpret receives an inert release rather than a DOM cast or ambient fallback.

## Acceptance evidence

- All six families pass their exact source to one selected process-global backend.
- Backend replacement does not redirect an existing attachment's release; repeated detach and
  same-source replacement release each attachment once.
- The borrowed source is left untouched by cleanup.
- The P5 scanner derives the Web adapter's registration and removal operation names. The two sorted
  multisets must match exactly, and mutation specimens prove that an added registration or a
  mismatched removal name fails.
- Package tests preserve event normalization, enabled policy, detach behavior, and independent
  multi-source routing.

## Adjacent work and later closure

At this slice's landing, five `direct-dom` findings remained in `inputManager.ts`:
`document.exitPointerLock` (two findings), `document.pointerLockElement` (one), and
`navigator.getGamepads` (two). The accepted P5 pointer-lock checkpoint remains immutable evidence of
that repair state.

The 2026-08-29 follow-up deleted the duplicate input pointer-lock surface rather than adding another
host seam. `lockApplicationPointer` and `exitApplicationPointerLock` remain the sole explicit command
surface. Gamepad polling and scheduling, pointer capture, and coalesced-event access remain adjacent
browser-shaped work; any future pointer-lock state query requires positive need, an explicit
provider, and distinct unsupported versus inactive answers.
