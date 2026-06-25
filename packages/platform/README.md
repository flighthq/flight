# @flighthq/platform

Environment identification — OS name, family, architecture, runtime shell, and engine — over a swappable web/native backend.

`platform` is the **root identification seam** of the desktop/mobile integration suite. Every public function is a free function that delegates to the active `PlatformBackend`. A web/DOM backend is lazily available, so every function works on the web; a native host (Electron, Tauri, Capacitor, a C/C++ shell) replaces it via `setPlatformBackend`. Snapshot reads fill an `out` value and return it. Unknown or unavailable fields resolve to sentinels (`''` / `-1` / `'unknown'` / `false`), never throwing. Import is side-effect-free: nothing registers until a host calls `setPlatformBackend`.

This package answers _what host am I running on_. Live, event-bearing, or richer concerns live in their own cells (see the delegation table) — `PlatformInfo` is a static identity snapshot.

## Functions

| Function | Purpose |
| --- | --- |
| `comparePlatformVersions(a, b)` | Compare two dotted version strings numerically, segment by segment. Returns `-1` / `0` / `1`; `''` sorts lowest. |
| `createPlatformInfo()` | Allocate a zeroed `PlatformInfo` (strings `''`, `kind`/`name`/`runtime`/`engine` `'unknown'`, `endianness` `'unknown'`, `pointerWidth` `-1`, `isTouch` `false`) to pass as `out`. |
| `createWebPlatformBackend()` | Build the default web backend. |
| `getPlatformBackend()` | Return the active backend, lazily creating the web default. There is always a backend. |
| `getPlatformEngine()` | Return the browser engine family. Convenience over `getPlatformInfo`. |
| `getPlatformInfo(out)` | Fill `out` with the running platform's identity snapshot and return it. |
| `getPlatformKind()` | Return the platform family (`desktop` / `mobile` / `web` / `unknown`). Convenience over `getPlatformInfo`. |
| `getPlatformName()` | Return the OS/runtime name. Convenience over `getPlatformInfo`. |
| `getPlatformRuntime()` | Return the host shell / runtime environment. Convenience over `getPlatformInfo`. |
| `isPlatformDesktop()` | `true` on a desktop host (Electron/Tauri/native window shell). |
| `isPlatformMobile()` | `true` on a mobile host (iOS/Android via Capacitor or a native shell). |
| `isPlatformNative()` | `true` when running inside a host shell, not a plain browser page. |
| `isPlatformTouch()` | `true` on a touch-primary device, independent of desktop/mobile classification. |
| `isPlatformVersionAtLeast(minimum)` | `true` when the live OS version is at or above `minimum`. `false` when the version is `''`. |
| `isPlatformWeb()` | `true` when running as a plain web page with no native host registered. |
| `setPlatformBackend(backend)` | Install a native host backend. Pass `null` to fall back to the web default. |

## `PlatformInfo` fields

`PlatformInfo` carries 14 fields. Every field is filled on the web from the user-agent string, `navigator`, and runtime probes; native hosts fill the same shape from OS APIs. Fields a web page cannot honestly report resolve to a sentinel rather than guessing.

| Field | Type | Value space | Sentinel | Web source | Native source |
| --- | --- | --- | --- | --- | --- |
| `name` | `PlatformName` | `'web'` `'windows'` `'macos'` `'linux'` `'ios'` `'android'` `'unknown'` | `'unknown'` | parsed from UA string | OS name |
| `kind` | `PlatformKind` | `'desktop'` `'mobile'` `'web'` `'unknown'` | `'unknown'` | derived from `name` | OS family |
| `version` | `string` | dotted OS version, e.g. `'10.15.7'` | `''` | parsed from UA string (best-effort) | OS version API |
| `arch` | `string` | `'x64'` `'arm64'` `'x86'` `'arm'` `'wasm'`, … | `''` | parsed from UA string | CPU arch |
| `locale` | `string` | BCP-47 tag, e.g. `'en-US'` | `''` | `navigator.language` | OS locale |
| `isTouch` | `boolean` | touch-primary input | `false` | `navigator.maxTouchPoints > 0` | input enumeration |
| `runtime` | `PlatformRuntime` | `'web'` `'electron'` `'tauri'` `'capacitor'` `'native'` `'unknown'` | `'unknown'` | probed from `window` globals | host shell identity |
| `engine` | `PlatformEngine` | `'gecko'` `'blink'` `'webkit'` `'unknown'` | `'unknown'` | parsed from UA string | `'unknown'` (no browser engine) |
| `engineVersion` | `string` | dotted engine version | `''` | parsed from UA string | `''` (no browser engine) |
| `endianness` | `PlatformEndianness` | `'big'` `'little'` `'unknown'` | `'unknown'` | `ArrayBuffer` byte-order probe | CPU byte order |
| `pointerWidth` | `32 \| 64 \| -1` | word width in bits | `-1` | inferred from `arch` | inferred from `arch` |
| `osBuild` | `string` | OS build identifier | `''` | **native-reserved** — always `''` | OS build string |
| `distro` | `string` | Linux distribution id, e.g. `'ubuntu'` | `''` | **native-reserved** — always `''` | `os-release` id |
| `distroVersion` | `string` | Linux distribution version | `''` | **native-reserved** — always `''` | `os-release` version |

`osBuild`, `distro`, and `distroVersion` exist in the shape so a native backend can fill them without a breaking type change. The web backend cannot honestly report them, so it returns `''`; they stay empty until a native host provides them. Treat `''` here as **native-reserved**, not an error.

## Cross-package delegation

`platform` reports only host **identity**. Richer or live concerns belong to their own cells; reach for these rather than expecting them on `PlatformInfo`:

| Concern | Owner | Why not here |
| --- | --- | --- |
| Device model, manufacturer, memory, safe-area insets | `@flighthq/device` | Hardware/device identity is a distinct, larger snapshot. |
| Battery, charging, low-power, keep-awake | `@flighthq/power` | Live, event-bearing state — not a static snapshot. |
| Display enumeration, work area, scale factor | `@flighthq/screen` | Multi-display geometry is its own live surface. |
| App name/version, quit/relaunch, single-instance lock | `@flighthq/app` | Application/process identity, not host identity. |

The UA-string parsing primitives (`parseUserAgent*`, `probeEndianness`) live in `@flighthq/useragent`, the shared value-leaf both `platform` and `device` build their web backends on.

## Usage

```ts
import { createPlatformInfo, getPlatformInfo, isPlatformVersionAtLeast } from '@flighthq/platform';

const info = getPlatformInfo(createPlatformInfo());
console.log(info.name, info.kind, info.arch, info.runtime);

if (isPlatformVersionAtLeast('10.15')) {
  // gate a feature on a minimum OS version
}
```
