# @flighthq/device

Device identity, hardware, and safe-area insets over a swappable web/native backend.

`device` is a host-identity leaf in the platform-integration suite. Every public function is a free function that delegates to the active `DeviceBackend`. A web/DOM backend is lazily available, so every function works on the web; a native host (Electron, Tauri, Capacitor, a C/C++ shell) replaces it via `setDeviceBackend`. Snapshot reads fill an `out` value and return it. Unknown or unavailable fields resolve to sentinels (`''` / `-1` / `false`), never throwing.

Battery state is **not** here — it is a live, event-bearing concern owned by `@flighthq/power`. `DeviceInfo` is a static identity snapshot. Live multi-display enumeration and work-area geometry belong to `@flighthq/screen`; `DeviceDisplayMetrics` describes only the built-in display.

## Functions

| Function | Purpose |
| --- | --- |
| `createDeviceCapabilities()` | Allocate a zeroed `DeviceCapabilities` (all `false`) to pass as `out`. |
| `createDeviceDisplayMetrics()` | Allocate a zeroed `DeviceDisplayMetrics` (all `-1`) to pass as `out`. |
| `createDeviceInfo()` | Allocate a zeroed `DeviceInfo` (strings `''`, booleans `false`, arrays `[]`, numbers `-1`) to pass as `out`. |
| `createSafeAreaInsets()` | Allocate a zeroed `SafeAreaInsets` (all edges `0`) to pass as `out`. |
| `createWebDeviceBackend()` | Build the default web backend. |
| `enableWebSafeAreaInsets()` | Mount a CSS `env(safe-area-inset-*)` probe; returns a dispose function. Opt-in (touches the DOM). |
| `getDeviceBackend()` | Return the active backend, lazily creating the web default. There is always a backend. |
| `getDeviceCapabilities(out)` | Fill `out` with input/hardware capability flags. |
| `getDeviceDisplayMetrics(out)` | Fill `out` with the built-in display metrics. |
| `getDeviceId()` | Return a stable install identifier (resettable, not a hardware serial). |
| `getDeviceInfo(out)` | Fill `out` with the device's identity snapshot. |
| `getSafeAreaInsets(out)` | Fill `out` with safe-area insets, in CSS pixels. |
| `refreshDeviceInfo()` | Invalidate a backend snapshot cache so the next read is fresh. No-op on the stateless web default. |
| `setDeviceBackend(backend)` | Install a native host backend; pass `null` to fall back to the web default. |

## `DeviceInfo` fields

| Field | Type | Unit | Sentinel | Web backend |
| --- | --- | --- | --- | --- |
| `arch` | `string` | CPU architecture token (e.g. `x86_64`, `arm64`) | `''` | Parsed from the UA / `userAgentData.platform`. Best-effort. |
| `availableMemory` | `number` | bytes of currently-available RAM | `-1` | Not exposed by browsers — always `-1`. |
| `boardName` | `string` | hardware board / mainboard name | `''` | Not exposed — always `''`. |
| `colorGamut` | `string` | display color gamut token | `''` | Not exposed — always `''`. |
| `cpuCores` | `number` | logical CPU core count | `-1` | `navigator.hardwareConcurrency` when present. |
| `fontScale` | `number` | OS font-scale multiplier (`1.0` = default) | `-1` | Not exposed — always `-1`. |
| `formFactor` | `DeviceFormFactor` | physical device class (open string-kind: `Desktop`, `Phone`, `Tablet`, `TV`, `Watch`, `Car`, `Unknown`, or vendor-prefixed) | `'Unknown'` | Parsed from the UA + `maxTouchPoints`. |
| `gpuRenderer` | `string` | GPU renderer string | `''` | `WEBGL_debug_renderer_info`; may be masked/randomized by browser privacy budget. |
| `gpuVendor` | `string` | GPU vendor string | `''` | `WEBGL_debug_renderer_info`; same caveat. |
| `isHdr` | `boolean` | display is HDR-capable | `false` | Not exposed — always `false`. |
| `isJailbroken` | `boolean` | iOS jailbreak detected | `false` | No web detection — always `false`. |
| `isLowEndDevice` | `boolean` | heuristically a low-end device | `false` | Heuristic: `≤ 1 GiB` RAM or `≤ 2` cores. Unknown inputs → `false`. |
| `isRooted` | `boolean` | Android root detected | `false` | No web detection — always `false`. |
| `isVirtual` | `boolean` | running on an emulator / VM | `false` | No web detection — always `false`. |
| `manufacturer` | `string` | hardware manufacturer | `''` | Not exposed — always `''`. |
| `marketingName` | `string` | consumer marketing name | `''` | Not exposed — always `''`. |
| `model` | `string` | hardware model identifier | `''` | Not exposed — always `''`. |
| `osBuild` | `string` | OS build number | `''` | Not exposed — always `''`. |
| `osName` | `string` | OS name | `''` | Parsed from the UA. |
| `osVersion` | `string` | OS version string | `''` | Parsed from the UA. |
| `platformString` | `string` | raw platform identifier | `''` | The full UA string. |
| `productName` | `string` | product / device codename | `''` | Not exposed — always `''`. |
| `supportedAbis` | `readonly string[]` | supported native ABIs | `[]` | Not exposed — always `[]`. |
| `totalMemory` | `number` | bytes of total RAM | `-1` | `navigator.deviceMemory` (GiB) converted to bytes; coarse, privacy-clamped. |
| `webViewVersion` | `string` | host WebView version | `''` | Not applicable (we are the browser) — always `''`. |

## `DeviceCapabilities` fields

| Field | Type | Sentinel | Web backend |
| --- | --- | --- | --- |
| `hasKeyboard` | `boolean` | `false` | Heuristic: desktop UA likely has a physical keyboard. Cannot distinguish hybrid (Surface, iPad + keyboard). |
| `hasMouse` | `boolean` | `false` | Heuristic: `maxTouchPoints === 0` is a strong pointer-device signal. Cannot confirm a physical mouse. |
| `hasStylus` | `boolean` | `false` | No reliable browser signal — always `false`. |

Richer pointer/keyboard event handling lives in `@flighthq/input` and `@flighthq/interaction`; `DeviceCapabilities` only surfaces capabilities with no dedicated package owner.

## `DeviceDisplayMetrics` fields

| Field | Type | Unit | Sentinel | Web backend |
| --- | --- | --- | --- | --- |
| `colorDepth` | `number` | bits per pixel | `-1` | `screen.colorDepth`. |
| `densityDpi` | `number` | dots per inch | `-1` | Not exposed by browsers — always `-1`. |
| `logicalHeight` | `number` | CSS pixels | `-1` | `screen.height`. |
| `logicalWidth` | `number` | CSS pixels | `-1` | `screen.width`. |
| `physicalHeight` | `number` | device pixels | `-1` | `screen.height × devicePixelRatio` when the ratio is known. |
| `physicalWidth` | `number` | device pixels | `-1` | `screen.width × devicePixelRatio` when the ratio is known. |
| `pixelRatio` | `number` | device pixels per CSS pixel | `-1` | `window.devicePixelRatio`. |

## `SafeAreaInsets` fields

| Field | Type | Unit | Sentinel | Web backend |
| --- | --- | --- | --- | --- |
| `top` | `number` | CSS pixels | `0` | `0` by default; real `env(safe-area-inset-top)` after `enableWebSafeAreaInsets()`. |
| `right` | `number` | CSS pixels | `0` | `0` by default; real `env(safe-area-inset-right)` after `enableWebSafeAreaInsets()`. |
| `bottom` | `number` | CSS pixels | `0` | `0` by default; real `env(safe-area-inset-bottom)` after `enableWebSafeAreaInsets()`. |
| `left` | `number` | CSS pixels | `0` | `0` by default; real `env(safe-area-inset-left)` after `enableWebSafeAreaInsets()`. |

Edge insets keep content clear of notches, rounded corners, and system bars. The web backend returns zeros until `enableWebSafeAreaInsets()` mounts a live CSS-var probe (one hidden element, no polling).

## `getDeviceId`

The web default generates a `crypto.randomUUID()` and persists it to `localStorage` as a stable install id. It returns `''` when no stable id can be formed (SSR, blocked storage, privacy mode). This is an **install** id — it resets when storage is cleared — not a hardware serial.

## Usage

```ts
import { createDeviceInfo, getDeviceInfo, getDeviceId } from '@flighthq/device';

const info = getDeviceInfo(createDeviceInfo());
console.log(info.formFactor, info.osName, info.cpuCores);

const installId = getDeviceId();
```
