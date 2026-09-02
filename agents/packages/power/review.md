---
package: '@flighthq/power'
status: solid
score: 85
updated: 2026-09-02
ingested:
  - source
  - tests
  - charter.md
  - status.md
  - assessment.md
  - prior review (2026-07-13)
  - host-web webPower.ts
  - host-electron electronPower.ts
  - types Power.ts, PowerBatteryHealth.ts, Host.ts (power slots)
---

# power — Review (live-tree survey, 2026-09-02)

> Supersedes the 2026-07-13 review (solid — 80/100). That review predated the R3 slot split, which deleted the entire ambient resolver/sentinel/diagnostic family and restructured the backend from a 13-member monolithic `PowerBackend` into eight optional Host slots (`status`, `change`, `keepAwake`, `idle`, `sessionLock`, `suspension`, `batteryHealth`, `thermal`). Every finding from the prior review has been re-evaluated against the current source.

## Verdict

**solid — 85/100.** The R3 refactor materially improved this package. The ambient backend layer (`getPowerBackend`/`setPowerBackend`/`createWebPowerBackend`) is deleted. Power capabilities are now slot-based: the host declares only what it can serve through `HostPowerCapabilities` (eight optional typed backends in `Host.ts:352-361`), and `attachPower` subscribes through exactly the slots present. This eliminates the old problem of inert subscriptions and constant-`Unknown` polls: a host that cannot observe idle omits the `idle` slot, so nothing polls (`power.ts:87-100`). The keep-awake seam now awaits the underlying operation, so an attempt is never reported as an outcome (`power.ts:20-23`). The charter's sole Decision (`enablePowerSignals` gate) remains correctly implemented (`power.ts:180-190`). What keeps it below authoritative is the undecided charter Open directions and a few remaining seam questions.

## Present capabilities

**18 exports** from `power.ts`, re-exported identically through both `.` (`index.ts`) and `./contract` (`contract.ts`). 18 colocated `describe` blocks in `power.test.ts` mirror the export list exactly.

- **Entity lifecycle:** `createPower` allocates an Entity with nine null signal slots (`power.ts:107-119`). `enablePowerSignals` idempotently allocates all nine via `??=` (`power.ts:180-190`). `attachPower` wires host event delivery; `detachPower` tears it down with attempt-all semantics; `disposePower` detaches and clears signals for GC eligibility.
- **Status query:** `getPowerStatus(host, out)` delegates to the host's `status.getStatus(out)` slot. `makePowerStatus()` allocates a value with the domain's complete unknown encoding (`batteryLevel: -1`, `thermalState: 'Unknown'`, etc.).
- **Keep-awake:** `acquirePowerKeepAwake(host, mode?)` and `releasePowerKeepAwake(host)` are async, resolving only after the provider has completed the operation. `isPowerKeepAwakeActive(host)` reads the provider's state. `destroyPowerKeepAwake(...hosts)` releases whole-provider resources, is alias-safe (two hosts sharing one provider destroy it exactly once, tracked via `_destroyedKeepAwake` WeakSet), and retries failed obligations on subsequent calls (`power.ts:131-148`).
- **Idle:** `getPowerSystemIdleState(host, thresholdSeconds)` and `getPowerSystemIdleTime(host)` delegate to the host's `idle` slot. The idle poll in `attachPower` only runs when the host provides the `idle` slot, and only emits when `hasSignalSlots` returns true (`power.ts:87-100`).
- **Thermal:** `getPowerThermalState(host)` delegates to the host's `thermal.getThermalState()`. The thermal subscription in `attachPower` delivers the state as the event payload (`power.ts:77-82`), matching the `PowerThermalBackend` contract (`Power.ts:119-121`).
- **Battery health:** `getPowerBatteryHealth(host, out)` delegates to the host's `batteryHealth.getBatteryHealth(out)`. `makePowerBatteryHealth()` allocates a value with the domain's unknown encoding.
- **Derived signals:** `onChange` carries a fresh `PowerStatus` per event (never a shared buffer — tested in `power.test.ts:96-109`). `onCharging`/`onDischarging` are computed from status transitions. `onLockScreen`/`onUnlockScreen` and `onSuspend`/`onResume` forward from the session-lock and suspension host slots respectively.
- **Polling config:** `getPowerIdlePollingIntervalMs`/`setPowerIdlePollingIntervalMs` — module-level config, clamped to minimum 1ms.

**Host backends verified:**

- **Web** (`host-web/src/webPower.ts`): Provides `status`, `change`, `keepAwake`, and `suspension`. Omits `idle`, `sessionLock`, `batteryHealth`, `thermal` — the honest report, since web has no API for any of them. Battery Status API with `Infinity -> -1` normalization and per-field cached readings in a closure. Wake Lock with visibility-aware sentinel tracking and release-listener cleanup. Suspend/resume via Page Lifecycle `freeze`/`resume` events.
- **Electron** (`host-electron/src/electronPower.ts`): Provides all eight slots except `thermal` is conditional on `getCurrentThermalState` being available. Battery health slot exists but returns `out` untouched (the main process reports no detail). `powerSaveBlocker` lifts synchronous operations into async results. Idle via `getSystemIdleState`/`getSystemIdleTime`. Session lock via `lock-screen`/`unlock-screen`.

## Gaps

- **`onIdleStateChange` emits no payload.** The signal type is `Signal<() => void>` (`Power.ts:144`), so a listener must re-call `getPowerSystemIdleState(host, threshold)` to learn the new state. This is asymmetric with `onThermalStateChange`, which carries the state as `Signal<(state: PowerThermalState) => void>` (`Power.ts:148`). The status.md and charter acknowledge this as an unruled direction.
- **Idle polling interval is module-level, not per-entity.** `_idlePollingIntervalMs` (`power.ts:267`) is a single global that applies to all future `attachPower` calls. Two entities attached with different idle polling needs cannot coexist; a per-entity interval passed to `attachPower` would resolve this, but the current API already takes `idleThresholdSeconds` per-call, so the split between threshold (per-entity) and interval (global) is uneven.
- **`assertSyncVoid` type-level guard is unexported and untested.** The `IsAny<T>` conditional-type helper and `assertSyncVoid` (`power.ts:277-280`) enforce at compile time that `provider.destroy()` returns `void` (not a promise). Clever, but it is private and has no test coverage. It would be invisible to callers writing custom backends, where the compile error is non-obvious.
- **Electron battery health is a slot with nothing behind it.** `getBatteryHealth` returns `out` untouched (`electronPower.ts:45-47`). The slot exists as a placeholder for future Electron capability; the status.md records this honestly.
- **Tauri and Capacitor have no power provider.** Recorded in status.md as unruled.
- **`make*` naming convention is precedent-setting.** `makePowerStatus` and `makePowerBatteryHealth` use `make*` instead of `create*` because these return plain values, not entities. The SDK-wide convention is unruled (status.md notes only two other `make*` allocators in-tree). If another name wins, these move with it.

## Charter contradictions

None. The charter's sole Decision (`enablePowerSignals` opt-in gate) is implemented. All four Open directions remain genuinely open and are accurate:

1. **Suspend/resume ownership vs `lifecycle`** — `power.onSuspend`/`onResume` coexist with `Lifecycle.onPause`/`onResume`. The proposed OS-sleep vs app-lifecycle split is unruled.
2. **Idle poll vs push** — the R3 conditional poller (only when host offers `idle` slot) partially addresses this, but the model decision is unruled.
3. **Thermal/idle asymmetry** — idle has a dedicated backend method (`getIdleState`), thermal reads through `getThermalState()` on a dedicated `PowerThermalBackend`. After R3 both are dedicated slots, which narrows the asymmetry to the idle-poll-vs-push question.
4. **Sentinel-everywhere native fields** — web thermal, idle, lock, and battery-health are absent by design; native backends fill them where possible.

## Contract and docs fit

- **Two-lane exports:** `.` re-exports the curated 18-function public API; `./contract` re-exports everything from `power.ts`. The lanes are identical in content, which is correct for a leaf package with no contract-only internals.
- **`sideEffects: false`:** Declared in `package.json:49`. Verified: no top-level registrations, listeners, or timers. Module-level state (`_idlePollingIntervalMs`, two WeakMap/WeakSet) is inert until called.
- **Dependencies:** `@flighthq/entity`, `@flighthq/signals`, `@flighthq/types` — minimal and correct. No circular or upward dependencies.
- **Types in `@flighthq/types`:** All exported types live in `Power.ts` and `PowerBatteryHealth.ts` in `@flighthq/types`. The power package exports functions only — no inline type definitions.
- **Host integration:** `PowerAttachHost` uses `Partial<HostPowerCapabilities>` (`Power.ts:126-128`), so a host passes exactly the slots it has. Individual query functions use narrow `Has*` interfaces (`HasPowerIdle`, `HasPowerKeepAwake`, etc., `Host.ts:835-857`), so a caller needs only the capability it queries.
- **Verb conventions:** `get*`/`set*`/`is*`/`make*`/`create*`/`attach*`/`detach*`/`dispose*`/`destroy*`/`enable*`/`acquire*`/`release*` all match their SDK-defined semantics. `dispose*` detaches + clears signals (GC-eligible). `destroy*` frees a whole-provider resource (OS wake lock).
- **`Readonly<T>`:** `onChange` delivers `Readonly<PowerStatus>` (`Power.ts:140`). Host parameters use `readonly` on all slot fields. `destroyPowerKeepAwake` takes `readonly HasPowerKeepAwake[]`.

## Candidate open directions

- **Payload on `onIdleStateChange`** — carry the new `PowerIdleState`, matching the thermal signal's design. Signal-signature change touching `@flighthq/types`; small but a symmetry decision.
- **Per-entity idle polling interval** — fold it into `attachPower` options alongside `idleThresholdSeconds`, removing the global `get/setPowerIdlePollingIntervalMs` pair. Would simplify the API and remove module-level mutable state.
- **Suspend/resume boundary ruling** — needed before `lifecycle` and `power` can be considered complete: which package owns OS machine-sleep and which owns app foreground/background.
- **Thermal/idle asymmetry resolution** — after R3 both are dedicated slots; the remaining question is whether idle should push (from native backends that can) vs poll universally.
