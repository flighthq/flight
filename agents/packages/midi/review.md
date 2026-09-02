---
package: '@flighthq/midi'
status: solid
score: 89
updated: 2026-09-02
ingested:
  - packages/midi/src
  - packages/midi/package.json
  - packages/types/src/Midi.ts
  - packages/types/src/Host.ts
  - packages/host-web/src/webMidi.ts
  - packages/permissions/src/permission.ts
  - agents/packages/midi/charter.md
  - agents/packages/midi/status.md
---

# midi — Review

## Verdict

`solid -- 89/100`. The package implements a complete basic MIDI profile with clean Entity-based
identity, pull-based state, named outcomes for every operation, and correct disposal semantics
distinguishing Flight-opened from borrowed ports. The two-lane export split is precise, all types
live in `@flighthq/types`, and every exported function has colocated test coverage. The score sits at
the top of the solid band rather than authoritative because no `explain*` diagnostic exists for
`operation-failed` sentinels, and the intentionally absent capabilities (system-exclusive, software
sequencing) leave the package narrower than a full MIDI feature set.

## Present capabilities

### midiAccess.ts (5 exports: 1 contract-only, 4 public)

- `createMidiAccessResource(operations)` (contract) -- provider-contract constructor wrapping
  `MidiAccessResourceOperations` in a bare Entity. Native MIDIAccess identity stays in a
  provider-local WeakMap; the public Entity exposes zero data fields beyond the Entity runtime key.
- `disposeMidiAccess(access)` -- attempt-all disposal: iterates every known state subscription and
  every known port, calling their individual dispose functions. Failed releases are retained for
  retry on the next call. Terminal after all succeed (`already-disposed` thereafter). A pending
  dispose promise is deduplicated so concurrent callers share the same settlement.
- `getMidiAccessInputPorts(access)` / `getMidiAccessOutputPorts(access)` -- delegate to provider
  `getInputPorts()` / `getOutputPorts()`, registering each returned port in the `knownPorts` set so
  disposal reaches hotplug-discovered ports. Returns `{ reason: 'disposed' }` after disposal and
  `{ reason: 'operation-failed' }` on provider exception.
- `requestMidiAccess(host)` -- the single access request route, delegating to
  `host.midi.access.requestAccess()`. Catches provider exceptions and returns
  `{ reason: 'operation-failed' }`. The accepted outcome carries a `MidiAccess` Entity.

### midiPermission.ts (1 export, public)

- `getMidiPermission(host)` -- read-only permission query through
  `host.midi.permission.getPermission()`. Returns standard `PermissionQueryOutcome` values.
  Provider exceptions produce `{ reason: 'operation-failed' }`.

### midiPort.ts (8 exports: 2 contract-only, 6 public)

- `createMidiInputPortResource(metadata, operations)` / `createMidiOutputPortResource(metadata,
  operations)` (contract) -- provider constructors creating typed port Entities with immutable
  diagnostic metadata (`id`, `manufacturer`, `name`, `version`). Matching native IDs never collapse
  two port Entities. The `type` discriminant (`'input'` / `'output'`) is set at construction.
- `closeMidiPort(port)` -- closes a port via provider `close()`. Checks connection state first;
  returns `already-closed`, `disposed`, `closed`, or `operation-failed`. Resets the `flightOpened`
  flag on success.
- `disposeMidiPort(port)` -- attempt-all disposal: releases all state subscriptions (and message
  subscriptions for input ports), then closes the port only if Flight opened it. Checks current
  connection state before attempting close so an externally-closed port is not redundantly closed.
  Failed items are retained for retry. Pending dispose is deduplicated.
- `getMidiPortConnection(port)` / `getMidiPortState(port)` -- pull current `MidiPortConnection` and
  `MidiPortState` from the retained provider operations. Connection and state are never stored on the
  Entity; `Reflect.has(port, 'state')` and `Reflect.has(port, 'connection')` are both false.
- `openMidiPort(port)` -- opens via provider `open()`. Pre-checks: disconnected ports cannot be
  opened, already-open ports return `already-open`, pending connections return `operation-failed`.
  Sets `flightOpened = true` on success so disposal knows it owns the close.
- `sendMidiMessage(port, data, timestamp?)` -- validates one complete basic MIDI message before
  forwarding to the provider. Validation checks: non-empty, status byte >= 0x80, correct
  byte count per status (channel voice 2-3 bytes, system common per spec, system real-time 1
  byte), all data bytes <= 0x7F, timestamp finite and non-negative when present. System-exclusive
  (status 0xF0) is explicitly rejected with `system-exclusive-not-enabled`. Data is copied to a
  plain array before provider delivery.

### midiSubscription.ts (12 exports, all public)

Three subscription families -- access-state, input-message, port-state -- each with `create*`,
`attach*`, `detach*`, and `dispose*` lifecycle functions.

- **Create** functions return Entity-based subscriptions carrying a Signal field. No backend
  attachment occurs at creation.
- **Attach** functions register a listener through the provider's attach callback, receiving a
  `MidiEventAttachment` with a `release()` method. Generation counters invalidate in-flight attaches
  when a concurrent detach or dispose arrives. If already attached, the prior attachment is detached
  first. Input message listeners defensively copy byte data (`new Uint8Array(data)`) and carry the
  native timestamp. Access-state listeners register hotplug ports into the access `knownPorts` set.
- **Detach** functions release the current backend attachment via `attachment.release()`. Failed
  releases are retained (the subscription stays in its owner's set) for retry. An in-flight attach
  is awaited and its attachment released if it succeeded.
- **Dispose** functions are terminal: they mark the subscription disposed, detach if attached, and
  clear the signal with `clearSignal()`. After a successful dispose, `already-disposed` is returned
  on subsequent calls. Attach after dispose returns `operation-failed` with `attachFailed: true`.

### midiResource.ts (5 exports, all contract-only)

- Two module-scoped WeakMaps (`accessStates`, `portStates`) keyed by Entity hold all mutable
  provider state. Public Entities carry no mutable fields.
- `retainMidiAccessResourceState` / `retainMidiInputPortResourceState` /
  `retainMidiOutputPortResourceState` -- initialize the WeakMap entries with empty ownership ledgers
  (`knownPorts`, `subscriptions`, `stateSubscriptions`, `messageSubscriptions` where applicable).
  Input ports get a `messageSubscriptions` set; output ports do not.
- `getMidiAccessResourceState` / `getMidiPortResourceState` -- return the retained state or
  `undefined` for unknown Entities.

## Gaps

1. **No diagnostics layer.** No `enableMidiGuards` or `explainMidi*` functions exist. The
   `operation-failed` sentinel is the most common failure reason across all operations, but its
   cause (provider exception, state mismatch, missing resource) is not recoverable through any
   diagnostic query. The codebase convention requires every silent sentinel to have a shakeable
   `explain*` counterpart.
2. **No examples.** No example application demonstrates MIDI access, port enumeration, message
   send/receive, or subscription lifecycle.
3. **System-exclusive access absent.** Intentionally deferred per charter; SysEx status 0xF0 is
   rejected at the validation layer.
4. **Software sequencing absent.** No scheduling, timing, or clock-based message dispatch.
5. **Hardware testing limited to injected facades.** All 34 tests use mock providers. Real-device
   hotplug, loopback, timing, and browser permission UI remain interactive-only evidence.

## Charter contradictions

None found. The implementation matches all three ratified decisions:
- Access is the only request route; `getMidiPermission` is read-only.
- Web construction uses injected `Pick<Navigator, ...>` facades; basic access never requests
  system-exclusive; outbound validation rejects sysex.
- Resource identity owns lifecycle via WeakMaps; disposal is attempt-all with retry; borrowed ports
  (externally opened before Flight) are never closed by Flight.

## Contract and docs fit

- **Two-lane exports**: 23 public exports on `.`, 31 total on `./contract`. The 8 contract-only
  exports are the three resource constructors and five resource-state accessors -- used by
  `@flighthq/host-web` and internally, never by application code.
- **Types in @flighthq/types**: all exported interfaces and type aliases live in
  `packages/types/src/Midi.ts` (20 types) with `MidiAccessBackend` and `MidiPermissionBackend` Host
  trait types in `Host.ts`. The implementation package exports functions only.
- **sideEffects: false**: declared in `package.json`. No top-level registration, no global mutation,
  no listeners started at import time.
- **Dependencies**: `@flighthq/entity`, `@flighthq/signals`, `@flighthq/types` only. Minimal and
  correct.
- **Named outcomes**: every operation returns a discriminated outcome object; no throws for expected
  failures. Provider exceptions are caught with bare `catch {}`.
- **Entity pattern**: access, input port, and output port are plain Entities. Subscriptions and
  attachments are also Entities. Runtime/provider state is held in WeakMaps keyed by Entity identity.
- **Disposal semantics**: `dispose*` (release-to-GC) is used correctly throughout; `destroy*` is
  absent because there are no GPU or native handles to free synchronously -- all cleanup is async
  release-based.
- **Source style**: exported functions are alphabetized in every file. Test `describe` blocks mirror
  exports in alphabetical order. Private functions and module-level state sit at the bottom of each
  file. No TODO comments, no divider comments. `import type` uses separate lines.
- **Readonly<T>**: applied to `MidiPortMetadata` parameter, `Uint8Array` in `sendMidiMessage`, and
  throughout type definitions. Outcome types use `readonly` on all fields.
- **Host dependency model**: `requestMidiAccess` takes `HasMidiAccess`, `getMidiPermission` takes
  `HasMidiPermission` -- explicit capability-shaped host dependencies, no singletons.
- **Permissions integration**: `@flighthq/permissions` projects `Host.midi.permission` for query and
  returns `no-request-route` for MIDI request attempts, keeping request authority with the access
  package.

## Candidate open directions

1. **Diagnostics**: add `explainMidiSendOutcome`, `explainMidiPortDispose`, and similar `explain*`
   queries that return plain-data diagnostic detail for `operation-failed` sentinels, and an
   `enableMidiGuards` shakeable guard module emitting through `@flighthq/log`.
2. **Examples**: a minimal Web MIDI example demonstrating access request, port enumeration,
   note-on/note-off send, and input message subscription.
3. **System-exclusive profile**: a separate ratified capability and safety contract for SysEx access,
   per charter open direction.
4. **Software sequencing**: clock-based message scheduling for precise timing, potentially as a
   separate `@flighthq/midi-sequencer` package.
