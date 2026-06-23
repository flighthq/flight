# Depth Review: @flighthq/device

**Domain**: Static device / OS identity — hardware model, manufacturer, OS name/version, platform/arch, virtualization, physical memory, and display safe-area insets — exposed over a swappable web/native backend.

**Verdict**: partial — 45/100

The package is a clean, correctly-shaped seam, but it is intentionally narrow: a single `DeviceInfo` snapshot of seven fields plus `SafeAreaInsets`. Compared to what mature device-info libraries (Capacitor `Device`, Cordova `device` + plugins, `react-native-device-info`, `expo-device`/`expo-constants`) expose, it covers only a fraction of the canonical surface. It is more than a stub — the backend seam, sentinels, out-param discipline, and OS detection are all real and tested — but it does not yet have the breadth of an authoritative device-identity library.

## Present capabilities

- `DeviceInfo` snapshot with: `model`, `manufacturer`, `osName`, `osVersion`, `platform`, `isVirtual`, `memory`.
- `SafeAreaInsets` (top/right/bottom/left, CSS px) — a genuinely useful field many competitors lack.
- Backend seam matching the platform-suite command pattern: `getDeviceBackend` / `setDeviceBackend` / `createWebDeviceBackend`, lazy web default, `null` to reset.
- `createDeviceInfo` / `createSafeAreaInsets` zeroed allocators usable as `out` targets, with documented sentinels (`''`, `-1`, `false`).
- Out-parameter reads (`getDeviceInfo(out)`, `getSafeAreaInsets(out)`) returning the filled object — allocation-explicit, hot-loop-safe, alias-safe by construction.
- Web backend reads `navigator.userAgent` and `navigator.deviceMemory`, with a small `detectWebOsName` UA classifier (Android/iOS/Windows/macOS/Linux).
- Web backend correctly returns sentinels for what a browser cannot know (model, manufacturer, OS version, safe area) rather than throwing — matches the suite's web-guard convention.
- Full colocated test coverage of every exported function, including the registered-backend, web-fallback, and reset paths.

## Gaps vs an authoritative device library

Canonical device-info libraries expose substantially more identity and capability surface. Missing by omission (would be expected in a AAA device library):

- **Display metrics**: screen width/height in physical and logical px, pixel ratio / DPI, color depth, refresh rate. (Some of this is plausibly delegated to `@flighthq/screen`, but a device library typically still surfaces device-class display data.)
- **Hardware identity / capability flags**: CPU core count (`navigator.hardwareConcurrency`), GPU/renderer string, total vs available memory (only a single coarse `memory` exists), disk/storage capacity, low-RAM/low-end-device hint.
- **Device class / form factor**: phone / tablet / desktop / TV / watch, `isTablet`, primary input (touch/mouse), notch presence. (`@flighthq/platform` owns desktop/mobile/web kind and touch, so some is by-design elsewhere — but `isTablet`/form-factor granularity has no home.)
- **Identifiers**: a stable per-install device/app identifier (`getId`/UUID), serial, fingerprint — the single most-used field in `react-native-device-info`/Capacitor `getId`. Entirely absent; not addressed even as a sentinel.
- **Locale / region / timezone**: language, region, measurement system, timezone. (`@flighthq/platform` owns `locale`, so by-design elsewhere — worth a doc cross-reference.)
- **OS detail**: API level / build number / kernel, `isEmulator` exists as `isVirtual` but no `isJailbroken`/`isRooted`, no `webViewVersion`.
- **App / runtime context**: app version, build, bundle id, installer source — typically bundled into device libraries (Flight scatters these into `@flighthq/app`, which is a defensible split).
- **Boolean conveniences**: `isVirtual` is present, but `isMobile`/`isDesktop`/`isTablet` device-class predicates are not (intentionally pushed to `@flighthq/platform`).
- **Battery / thermal / live state**: explicitly out of scope (owned by `@flighthq/power`) — by design, and documented in the type file.

Net: of the ~15–20 fields a mature device-identity API surfaces, this exposes 7 + safe-area. Several omissions (locale, touch, OS kind, battery) are deliberate cross-package splits and should not count against depth. The genuine by-omission gaps are: a stable device id, display/DPI metrics, CPU/core/GPU capability, total-vs-available memory, and form-factor granularity (`isTablet`).

## Naming / API-shape notes

- Naming is canonical and self-identifying: `getDeviceInfo`, `getSafeAreaInsets`, `createWebDeviceBackend`, `setDeviceBackend` all carry the full type word and match the platform-suite grammar exactly.
- `memory` is ambiguous in unit and meaning — competitors distinguish `totalMemory` (bytes) from `realMemory`/available, and `navigator.deviceMemory` is GiB-rounded. The web backend stores the raw `deviceMemory` (GiB) while a native host would likely report bytes; the field needs a documented unit or a split into `totalMemory`/`availableMemory` to be backend-consistent. This is a real conformance risk.
- `platform` is overloaded: the web backend assigns it the full `userAgent` string, while the field name and the test fixture (`'arm64'`) imply CPU architecture. These are different concepts; consider `arch` vs a separate UA/platform-string field.
- Sentinel discipline (`''` / `-1` / `false`) is consistent and well-documented in both the type and the allocators.
- The entity/runtime split is not used here (no runtime object), which is appropriate — `DeviceInfo` is a flat value snapshot, exactly the right shape for a static identity read and for the Rust port's value-type mapping.

## Recommendation

Treat as a deliberately-scoped seam that is correctly built but under-populated for its domain. To reach AAA depth without violating the cross-package splits:

1. Add the by-omission identity fields that have no other home: a stable device/install id (`getDeviceId` or `id` field with a web `crypto.randomUUID` + storage fallback), `cpuCores`, and split `memory` into documented `totalMemory`/`availableMemory` with explicit units (bytes).
2. Add form-factor granularity not covered by `@flighthq/platform`: `isTablet` / device-class, and display device metrics (DPI / pixel ratio) or an explicit doc note delegating to `@flighthq/screen`.
3. Resolve the `platform` overload — separate architecture (`arch`) from the UA/platform string, and the `memory` unit ambiguity, before any native host conforms to the seam.
4. Add doc cross-references in the type/package map for the deliberate splits (locale → `platform`, battery → `power`, app version → `app`, display → `screen`) so the omissions read as design, not gaps.

Until at least item 1 lands, this is a partial device library — solid foundation, narrow surface.
