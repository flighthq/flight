# Input ingress seam plan

_2026-08-27. Read-only implementation plan. Status: unratified; this record authorizes no source
change._

This plan covers the 26 `input-ingress` findings in the live P5 census. They are 13 DOM listener
registrations and the 13 removals which own their lifetimes, all in
`packages/input/src/inputManager.ts`. The current derived gate line is:

```text
P5 outstanding=62 direct-dom=18 input-ingress=26 scratch-surface=18 webgpu-acquisition=0
```

The goal of the eventual slice is to make those six attachment families consume a host-neutral input
source while keeping web event wiring inside an explicit web adapter. It must preserve the package
charter's opt-in attachment, exact detach behavior, and zero-allocation delivery. This is not authority
to implement the seam, and reducing the gate count alone is not acceptance.

## Measured population

The table is exhaustive for the 26-site `input-ingress` category. Lines are the 2026-08-27 snapshot;
the function and event names are the stable identifiers if unrelated edits move them.

| Family | Registration sites | Removal sites | Count | Coupled behavior to preserve |
| --- | --- | --- | ---: | --- |
| Gamepad | `attachGamepadInput`: `gamepadconnected`, `gamepaddisconnected` at 113–114 | same two events at 118–119 | 4 | seed connection state, emit connect/disconnect, and cancel the attachment's polling loop |
| Keyboard | `attachKeyboardInput`: `keydown`, `keyup` at 149–150 | same two events at 152–153 | 4 | key/code/location/modifier/repeat normalization and `preventDefault` policy |
| Pointer | `attachPointerInput`: `contextmenu`, `pointercancel`, `pointerdown`, `pointermove`, `pointerup` at 192–196 | same five events at 199–203 | 10 | pointer identity/type, buttons, pressure/contact geometry, coordinates, and context-menu suppression |
| Relative pointer | `attachRelativePointerInput`: document `mousemove` at 221 | `mousemove` at 222 | 2 | bind through the element's document while retaining the element as the detach identity |
| Text / IME | `attachTextInput`: `beforeinput`, `compositionupdate` at 247–248 | same two events at 250–251 | 4 | committed text versus composing edit, including an empty string payload |
| Wheel | `attachWheelInput`: `wheel` at 272 | `wheel` at 273 | 2 | delta mode and the web listener's `passive: !preventDefault` option |
| **Total** | **13** | **13** | **26** | |

The count is syntax population, not 26 independent features. An implementation that moves only the
13 registrations but leaves their removals in portable code has split a lifetime and is incomplete.

## Recommended seam

Resolve charter Open direction 1 with an **attach-and-push hybrid**:

- An `InputBackend` instance represents one host input source. It offers one binding operation for each
  of the six families above. A browser instance may wrap a window plus an element/document; a native
  instance may wrap a Lime, SDL, GLFW, or application-window event source. The portable contract does
  not expose `Window`, `EventTarget`, `HTMLElement`, or a native handle.
- Each binding operation receives a narrow `InputIngressSink` and `AttachInputOptions`, attaches using
  the host's mechanism, and returns an exact release handle. The backend pushes normalized
  `InputKeyboardData`, `InputPointerData`, `InputTextData`, and `InputGamepad*Data` through the sink.
- The input package owns the sink. It checks `manager.enabled` and synchronously emits the 12 signals
  driven by these listeners. This keeps enabled policy and public delivery in `@flighthq/input`; a
  backend does not know about signal implementation details. The three gamepad axis/button signals
  currently driven by `navigator.getGamepads()` remain in the explicitly adjacent slice below.
- The web implementation is an explicit `*Web*` adapter and owns all DOM listener translation. A host
  package may construct an adapter for each window/input surface. The portable path never probes for a
  DOM-shaped object or falls back to ambient browser globals.

This is deliberately not a public direct-dispatch API. Direct push alone would let a native host emit
events, but it would not represent who installed a subscription, who cancels it, how reattachment
replaces a binding, or how gamepad polling is bracketed. It is also deliberately not another
process-global backend slot. Input sources are per window or per surface, and more than one may be live
in a process; the backend instance is both the capability and its source identity.

The exact exported names and whether the existing DOM-taking overloads receive a deprecation window
remain direction decisions. The recommended end state is unambiguous: host-neutral `attach*Input`
accepts an `InputBackend`, while any compatibility entry point which accepts a DOM target is explicitly
named `*Web*` and delegates to the web adapter.

## Lifetime and ownership contract

The binding returned from an attach call is owned by Flight; the backend instance and underlying
window, element, device, or native event source remain caller-owned. The following rules are required:

1. The backend passed to an attach call is the origin for that binding. Changing any convenience
   provider used to construct later backends must not reroute its detach operation.
2. The existing key remains `(InputManager, backend instance, input family)`. Reattaching the same key
   releases the previous binding exactly once before storing the replacement. Different managers,
   backend instances, and families remain independent.
3. `detach*Input` invokes the origin release handle at most once and is otherwise a no-op. Release may
   remove listeners, callbacks, or a polling subscription created by that attach; it must not destroy
   the backend or its caller-owned source.
4. Disposing or replacing a host-owned backend cannot silently strand live bindings. Either the origin
   remains callable until its bindings release, or the host explicitly releases them before disposal.
5. Release is captured as one opaque operation. Portable code must not reproduce the web listener list
   during detach, because doing so would restore the host dependency and lose provider provenance.

The current `_inputBindings` side table already supplies the right behavioral model but uses
`EventTarget` as its identity type. The implementation should generalize that key to the backend/source
identity and retain the family symbols and replacement order.

## Normalization contract

Backends produce the existing shared data records; the manager does not accept browser event objects.
Payloads are borrowed for the duration of a synchronous sink call and may be reused immediately after
return. Consumers must not retain them. This preserves the zero-per-event-allocation charter while
letting each backend keep its own scratch records.

- **Keyboard:** preserve raw `key`, `code`, location, repeat, modifier booleans/bitset, portable
  `keyCode`, and a monotonic host timestamp. A native mapping may produce `KeyCode.UNKNOWN`; it must not
  invent a browser `code`.
- **Pointer and touch:** touch is normalized through the existing pointer model. `pointerId` is stable
  for the active contact within a backend instance and must not collide between simultaneously active
  contacts from that source. Preserve mouse/pen/touch kind, primary state, buttons, pressure, contact
  geometry, tilt, and twist; unsupported values use the existing neutral sentinels.
- **Coordinates:** `x`/`y` should be source-local logical pixels with origin at the input surface's top
  left. A backend converts device pixels to logical pixels and removes viewport/window offsets.
  `connectInputToInteraction(..., coordScale)` remains the logical-to-render backing-store scale and
  does not translate. This intentionally makes the contract explicit; web compatibility tests must
  expose any behavior change from today's `clientX`/`clientY` copy before ratification.
- **Relative pointer:** `deltaX`/`deltaY` use the same logical unit as absolute coordinates. Absolute
  `x`/`y` remain the host's current source-local position when available, otherwise the existing
  sentinel policy must be decided before implementation.
- **Wheel:** preserve logical deltas and `MouseWheelMode`. `preventDefault` and passive-listener choices
  are web policy; a host without an equivalent may ignore them without fabricating support.
- **Text / IME:** committed text and composition edits remain distinct sink operations. Empty text is a
  valid payload, and composition state must survive CJK and other multi-stage input methods.
- **Gamepad:** this listener slice preserves stable gamepad index/identity, mapping kind, and connection
  lifecycle. Axis/button state and monotonic polling timestamps belong to the adjacent polling/scheduler
  plan; an event-driven native provider must ultimately be able to push them without imitating
  `navigator.getGamepads()`.

Multi-keyboard and multi-pointer device identity remains the charter's separate Open direction 4. This
slice must not add an unratified public device-ID model as a side effect.

## Implementation sequence after approval

1. **Ratify the shape.** Decide the exported backend/source names, the DOM compatibility window, and
   the source-local coordinate ruling. Record that decision in the input charter before source work.
2. **Land contract types and a fake backend.** Add the six bind capabilities, sink callbacks, and
   opaque release handle in `@flighthq/types`; add compile-only contract coverage without any DOM
   types. No ambient listener may be installed on import.
3. **Pin lifecycle behavior in core tests.** Prove origin release after a host changes the provider used
   for later sources, exact-once detach, same-key replacement, cross-source/family isolation,
   disabled-manager dropping, synchronous borrowed-payload delivery, and release without destroying
   the caller source.
4. **Build the explicit web adapter.** Move the 13 registrations and 13 matching removals as six intact
   groups. Preserve listener names, `preventDefault`, the relative-pointer document choice, and the
   wheel passive option. Web parity tests must observe both registration options and removal.
5. **Route the six portable attach families.** Store only the opaque origin release in the generalized
   binding table. Migrate keyboard/text first, pointer/relative/wheel second, and gamepad listeners
   last so each commit has a complete attach/detach bracket.
6. **Close the measured population.** Re-run the derived census, require `input-ingress=0`, and lower
   `P5_HOST_BYPASS_BUDGET['input-ingress']` from 26 to 0 in the same commit. Confirm all 26 sites moved
   under an explicit web-adapter/host-implementation exclusion rather than disappearing without parity
   coverage.
7. **Update package truth.** Update the input status/review and host requirements with the exact scope
   delivered. Do not declare the whole `InputBackend` portability gap closed while the adjacent
   browser capabilities below remain.

## Verification matrix

Acceptance needs all of the following, not only a green census:

- A fake native backend can drive all 12 listener-originated signals in this slice without constructing
  DOM events or DOM targets; the test must not pretend that the three polling-originated gamepad
  signals have moved too.
- Each of the six attach families has attach, event delivery, same-key replacement, explicit detach,
  repeated-detach, and backend-origin replacement coverage.
- The sink drops delivery while `InputManager.enabled` is false and resumes without reattachment.
- At least two backend instances and two managers can be attached concurrently without cross-release
  or payload routing.
- A retained test reference sees the same borrowed payload identity reused across deliveries, while
  every field is refreshed so stale fields cannot leak between pointer/wheel/relative variants.
- Web parity covers all 13 event names and all 13 removals, exact wheel options, context-menu policy,
  relative document routing, IME composition/empty text, touch-as-pointer identity, and gamepad
  connect/disconnect state seeding.
- Package typecheck/tests pass, the P5 scanner reports `input-ingress=0`, and a negative scanner fixture
  proves a new non-web DOM input listener still exceeds the zero budget.

## Explicitly adjacent, not in this 26-site slice

Five P5 `direct-dom` findings are also in `inputManager.ts`: `document.exitPointerLock` (two findings),
`document.pointerLockElement` (one), and `navigator.getGamepads` (two). The gamepad attachment also uses
`requestAnimationFrame`/`cancelAnimationFrame`, and pointer capture/coalesced-event helpers are
browser-shaped even though this scanner does not count them. They need the chartered follow-up for
gamepad polling/scheduling and pointer-lock/capture capabilities.

This plan must not absorb those sites silently or claim they are solved by listener extraction. The
recommended attach-and-push shape leaves room for those capabilities, but their availability,
ownership, and scheduling semantics require their own measured plan. Until that follow-up lands, the
package has a listener-ingress seam, not a complete native `InputBackend`.
