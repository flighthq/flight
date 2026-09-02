---
package: '@flighthq/haptics'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source (packages/haptics/src)
  - packages/types/src/Haptics.ts
  - packages/types/src/Host.ts (HasInputHaptics)
  - packages/host-web/src/webHaptics.ts
  - packages/host-web/src/webHaptics.test.ts
  - packages/host-capacitor/src/capacitorHaptics.ts
  - packages/host-capacitor/src/capacitorHaptics.test.ts
---

# haptics — Review

> Depth review of the live tree (2026-09-02). Supersedes the 2026-07-13 review (solid/80). The major
> change since then: the `d6ffbd7de` refactor replaced the singleton `getHapticsBackend` /
> `setHapticsBackend` / lazy-web-default model with the explicit host capability model
> (`HasInputHaptics`). The package now exports 10 pure delegation functions (down from 13), all taking
> a `host: HasInputHaptics` first argument. The web backend (`webHapticsBackend`) moved to
> `@flighthq/host-web` and is wired into `webInputHost`; the Capacitor backend
> (`createCapacitorHapticsBackend`) wires through `capacitorHost` in `@flighthq/host-capacitor`.

## Verdict

`solid — 82/100`. The device-vibration and semantic-trigger tier is complete, well-tested, and now
fully aligned with the explicit dependency model. The singleton/ambient state that the prior review
accepted is gone — every function takes its host explicitly, and the package has zero module-scoped
mutable state, zero side effects, and a single dependency (`@flighthq/types`). Two backends (web,
Capacitor) prove the seam from both ends. What keeps it from the high 80s: gamepad rumble (dual-rotor)
remains absent, and the pattern-authoring/continuous-player tier is still undecided.

## Present capabilities

Verified against `packages/haptics/src/haptics.ts` (61 lines) and `haptics.test.ts` (19 tests across
10 `describe` blocks, one per export, alphabetized):

- **Raw vibration**: `vibrateDevice(host, durationMs)`, `vibrateDevicePattern(host, pattern)` (returns
  `false` on empty array before reaching the backend), `vibrateDeviceWaveform(host, timings,
  amplitudes, repeat = -1)` with automatic `vibratePattern(timings)` fallback when the backend omits
  the optional `vibrateWaveform` member, `cancelDeviceVibration(host)`.
- **Semantic triggers**: `triggerHapticImpact(host, style, intensity?)` resolves the default intensity
  to `1` at the free-function layer via `intensity ?? 1` (the charter Decision); five styles (`heavy`,
  `light`, `medium`, `rigid`, `soft`). `triggerHapticNotification(host, type)` covers `error`,
  `success`, `warning`. `triggerHapticSelection(host)`.
- **Introspection**: `getHapticsCapabilities(host, out)` — caller-owned out-param, returns the same
  `out`. `isHapticsSupported(host)`. `prepareHaptics(host)` — optional-chained so a backend without
  `prepare` is a silent no-op.
- **Seam**: `HapticsBackend` interface in `@flighthq/types/src/Haptics.ts` (42 lines). `HasInputHaptics`
  in `Host.ts` nests `haptics: HapticsBackend` under `input`. The derived `HapticsOperation` type
  (`keyof HapticsBackend`) is a clean single-source roster.
- **Web backend** (`host-web/src/webHaptics.ts`): `webHapticsBackend` const maps impact styles to
  duration approximations, clamps intensity 0..1, routes everything through `_webVibrate` (catches
  exceptions, `false` when `navigator.vibrate` is absent). Reports `patterns` only, no intensity or
  amplitude control. Omits `vibrateWaveform` deliberately so callers fall back honestly. 4 test cases
  cover the absent-API branch, capabilities honesty, empty-pattern rejection, and deliberate waveform
  omission.
- **Capacitor backend** (`host-capacitor/src/capacitorHaptics.ts`): `createCapacitorHapticsBackend`
  factory maps Flight's 5 impact styles onto Capacitor's 3 (`soft` -> LIGHT, `rigid` -> HEAVY),
  uppercases notification types, fires async calls fire-and-forget returning `true` ("request issued").
  Reports `cancel` false and `vibratePattern` false (Capacitor only supports single-duration vibrate).
  3 test groups verify style mapping, operation dispatch, and capability reporting.
- **Package hygiene**: `sideEffects: false`, two export lanes (`.` and `./contract`), sole dependency
  `@flighthq/types`, `Readonly<number[]>` on pattern/waveform inputs, no module-scoped mutable state,
  no import side effects.

## Gaps

1. **Gamepad rumble (dual-rotor) absent.** No `vibrationActuator` / dual-rumble surface
   (`strongMagnitude`/`weakMagnitude`, duration, `playEffect`/`reset`). This remains the biggest hole
   against a textbook haptics rubric. Its home (haptics vs `@flighthq/input`) is a cross-package
   design fork.
2. **Pattern-authoring/continuous tier undecided** (charter Open direction #1): no `HapticEvent`,
   `HapticPattern`, `HapticPlayer`, or any Core-Haptics-grade transient/continuous event model.
   Status.md confirms nothing exists even as types. Gates the potential `-formats` neighbor (AHAP
   import) and any signals group.
3. **Down-conversion contract unwritten** (charter Open direction #2): if patterns land, the
   degradation spec from rich patterns to web's duration-only motor is needed.
4. **No diagnostics layer.** `false` sentinels with no `explain*` / `enable*Guards`. Suite-wide
   condition across platform-integration packages.
5. **Capacitor backend ignores `intensity` argument entirely** (`capacitorHaptics.ts:31` — the
   `impact` function signature accepts `style` but not `intensity`). The `HapticsBackend.impact`
   interface declares `intensity?: number`, but the Capacitor adapter drops it silently. This is
   honest (Capacitor has no intensity control) but the capability query does not distinguish
   "intensity supported" granularly — `capabilities.intensity` reports `false`, which is correct but
   could leave a caller unsure whether the value was ignored or applied at reduced fidelity.
6. **Rust mirror `flighthq-haptics` unstarted.** Per suite-wide decision, TS is spec; Rust conforms
   later.

## Charter contradictions

None found. Every charter claim verified:

- The 2026-07-02 Decision (fix `triggerHapticImpact` default intensity) is implemented: `intensity ?? 1`
  at `haptics.ts:27`.
- The charter says "13 exports" but the package now has 10. This is not a contradiction — the charter
  describes a snapshot that was accurate when written. The refactor (`d6ffbd7de`) removed
  `getHapticsBackend`, `setHapticsBackend`, and `createWebHapticsBackend` as the package moved to the
  explicit host model. The charter's "What it is" section should be updated to reflect the current
  export count, but the architectural direction (explicit host) is the correct evolution of the
  platform-integration pattern.
- The boundary holds: no badge or sensor creep.
- `enableHostWebHaptics()` reference in the charter: the charter says backends are installed via
  `enableHostWebHaptics()` from `@flighthq/host-web`. The current model instead uses
  `webHapticsBackend` as a value wired into `webInputHost` — the explicit host replaces the enabler
  pattern for haptics. The charter description predates the refactor and should be updated.

## Contract & docs fit

**Package compliance:**
- Types-first: all types (`HapticsBackend`, `HapticsCapabilities`, `HapticImpactStyle`,
  `HapticNotificationType`, `HapticsOperation`, `HasInputHaptics`) live in `@flighthq/types`. No
  inline type definitions in the haptics package.
- Full unabbreviated function names: `cancelDeviceVibration`, `getHapticsCapabilities`,
  `vibrateDeviceWaveform` — each self-identifying without context.
- `out`-param convention: `getHapticsCapabilities(host, out)` returns the passed `out`.
- Sentinels not throws: every trigger returns `boolean`; no exceptions for expected failure.
- Two export lanes: `.` re-exports from `./contract`, which re-exports from `./haptics`.
- `sideEffects: false`: declared and true — no registration at import.
- Explicit dependency model: the `host: HasInputHaptics` parameter replaces the old singleton.

**Candidate revisions to admin docs:**
- The charter's "What it is" section says "13 exports" and mentions `enableHostWebHaptics()` from
  `@flighthq/host-web`. Both are stale after the explicit-host refactor: the package now has 10
  exports, and the web backend is wired as `webHapticsBackend` through `webInputHost` rather than an
  `enableHostWeb*()` enabler. The charter description should be updated to reflect the current
  `HasInputHaptics` host model.
- The platform-integration shared principles (`agents/packages/platform-integration.md`) describe the
  pattern as "installed explicitly via `enableHostWeb()` … from `@flighthq/host-web`; native hosts
  replace via `set*Backend`." For haptics, neither applies anymore — the explicit host object has
  replaced both. This is the correct direction per the explicit dependency model, but the shared
  principles doc still describes the old pattern as current.

## Candidate open directions

1. **Gamepad rumble home** — decide whether dual-rotor rumble lives in haptics (device-agnostic
   "haptics" framing, keyed by a gamepad reference) or in `@flighthq/input` (which owns gamepad
   identity); either way it is the missing rubric row. Unchanged from the prior review.
2. **`HapticPattern` + player tier and its web down-conversion contract** (charter Open directions
   #1-2) — the gate on `-formats` (AHAP) and any signals group. Unchanged from the prior review.
3. **Charter text refresh** — the "What it is" section's export count and enabler references are stale
   after the explicit-host migration. Not a design question, but a factual update the charter needs.
