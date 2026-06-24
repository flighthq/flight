---
package: '@flighthq/device'
crate: flighthq-device
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# device — Charter

## What it is

`@flighthq/device` is the platform-suite **command capability** for _static device / OS identity_: a flat set of free functions (`getDeviceInfo`, `getDeviceCapabilities`, `getDeviceDisplayMetrics`, `getSafeAreaInsets`, `getDeviceId`, `refreshDeviceInfo`) over a swappable `DeviceBackend`, with a lazily-constructed web default and `setDeviceBackend(backend | null)` for native hosts. It answers "what hardware/OS is this and what are its fixed traits?" — model, manufacturer, OS name/version, arch, CPU cores, physical/total memory, GPU vendor/renderer, form factor, virtualization, low-end heuristic, safe-area insets, and a resettable install id.

It is the _snapshot_ end of the host suite, and the surrounding map draws several deliberate lines:

- vs **`@flighthq/screen`** — `device` exposes the _built-in_ display's static `DeviceDisplayMetrics`; live multi-display enumeration, work area, orientation, and scale-factor changes belong to `screen`.
- vs **`@flighthq/power`** — battery / charging / low-power are _live_ concerns; `device` carries no battery field.
- vs **`@flighthq/platform`** — the coarse identification seam (OS name, desktop/mobile/web kind, arch, locale, touch) is `platform`; `device` is the richer hardware-identity layer. Locale and touch are intentionally homed in `platform`, not duplicated here.
- vs **`@flighthq/sensors` / `@flighthq/geolocation`** — any _streaming_ device signal is an event capability elsewhere; `device` reads are point-in-time.

The shared shapes (`DeviceInfo`, `DeviceCapabilities`, `DeviceDisplayMetrics`, `SafeAreaInsets`, `DeviceBackend`, the `DeviceFormFactor*` string-kinds) live in `@flighthq/types/src/Device.ts`, with the cross-package split documented inline — the review calls this exemplary header-layer discipline.

## North star (proposed)

Inferred from the code, the platform-suite pattern, and the SDK design constraints — edit freely.

1. **Backend seam, web default, no side effects.** One `DeviceBackend` trait; a lazily-built web backend so every function works on the web with zero host; native hosts swap in via `setDeviceBackend`; `setDeviceBackend(null)` restores the web default. `sideEffects: false` stays honored — nothing constructs at module load.
2. **Honest sentinels over guesses.** Every genuinely-unknowable-on-web field returns its sentinel (`'' / -1 / false / []`; insets `0`) rather than a fabricated value, and read paths that can fail (`getId`, WebGL info probe) try/catch to a sentinel rather than throw. A consumer can always tell "unknown" from "known."
3. **Value-typed, `out`-param, C/C++-portable.** Plain data shapes in `@flighthq/types`; a `create*` constructor per shape that allocates a zeroed snapshot; every read is an `out`-param that returns `out`. No wrapper objects, no hidden allocation — the shape that makes `device` a Wasm-mixable leaf.
4. **Static identity only; live signals live elsewhere.** `device` is the snapshot layer. Anything that changes at runtime under the device's own power (battery, connectivity, orientation streams, multi-display changes) is a neighbor's event capability, not a field here. `refreshDeviceInfo` exists for native backends that cache, not to turn `device` into a live feed.
5. **Dependency-light.** A host-identity leaf should stay near the bottom of the dependency graph: `@flighthq/types` plus the web platform, and no more than its identity genuinely requires.

## Boundaries (proposed)

**In scope**

- Static `DeviceInfo` (model/manufacturer/OS/arch/memory/GPU/form-factor/virtualization/low-end).
- Input/hardware `DeviceCapabilities` flags with no dedicated package owner (keyboard/mouse/stylus).
- Built-in-display `DeviceDisplayMetrics` (color depth, logical/physical size, pixel ratio, DPI when known).
- `SafeAreaInsets` with an opt-in live CSS-`env()` probe (`enableWebSafeAreaInsets`, returns a `dispose`).
- A stable, resettable install id (`getDeviceId`).
- The web default backend; the native-host seam.

**Out of scope (non-goals)**

- Live/streaming device signals — battery (`power`), connectivity (`network`), orientation/motion (`sensors`), keyboard visibility (`keyboard`).
- Live multi-display geometry, work area, scale-factor change events (`screen`).
- Locale and touch identification (`platform`).
- App/process identity and install _provenance_ (store vs sideload) — leans toward `@flighthq/app` (open direction 4).
- A persistent-storage abstraction — `getId` uses `localStorage` directly today; whether it should route through `@flighthq/storage` is an open direction.

## Decisions

None blessed yet.

## Open directions

Every candidate question carried from `review.md`, plus the structural fork that touches this package. These are where an agent must **ask**, not assume.

1. **Resolve the `device-formats` → `useragent` fork (load-bearing).** The bundle ships a new `@flighthq/device-formats` package that the SDK register has **already rejected** (`register.md:38`: blood-from-a-stone, no plurality, `-formats` misnamed on a UA string, `parseUserAgentArch` exported from _both_ `device-formats` and `platform-formats`). The mandated resolution is to **collapse UA parsing into a shared `useragent` value-leaf** consumed by the web backends of both `device` and `platform`. This is structural-fork E (the bedrock test) + the triad plurality guard applied here. Until blessed and executed, `device` imports from a rejected package and a duplicate export ships. There is also internal duplication: `detectDesktopUa` (`device.ts:289`) re-implements the desktop-UA regex that `parseUserAgentFormFactor` already owns. **Does the user bless the `useragent` collapse?** Cross-package decision — surfaced, not actioned.
2. **`device` ↔ `screen` boundary ruling.** `DeviceDisplayMetrics` (static built-in display) vs `@flighthq/screen` (live multi-display, work area, orientation) is documented inline in `Device.ts` but never blessed in the Package Map. One line would prevent future overlap.
3. **`getId` durability seam.** Inject `@flighthq/storage` vs the current direct `localStorage`. Touches the dependency-light north star and id durability across backends.
4. **`installSource` / install provenance home.** Play Store / App Store / sideloaded provenance is a common device-library field; Flight's layering suggests `@flighthq/app`. Confirm placement (and therefore whether it is a non-goal here).
5. **Predicate-convenience policy.** Ship `isDeviceTablet(info)` / `isDevicePhone(info)` etc. as free functions, or leave consumers to compare the `formFactor` string-kind? A taste call the charter should record once.
6. **Async id seam (`getDeviceIdAsync`).** A `Promise<string>` path for native keystores (Android Keystore, iOS Keychain). Deferred today; the sync path covers web. Real once a native host lands — confirm the intended shape now so the seam is designed, not retrofitted.
7. **What "Gold"/authoritative means for a host-identity leaf.** The worker status self-scored 91/100 "Gold" counting only within-`device` completeness and ignoring the packaging verdict. The charter should state the bar so a future session does not re-spawn a rejected neighbor and call it done.
8. **Rust crate (`flighthq-device`).** Asserted in the front matter (`crate: flighthq-device`) but unbuilt; no entry in the conformance map yet. As a value-typed leaf it is mixable. Confirm it as planned-and-unbuilt vs. a near-term target.
