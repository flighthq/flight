# @flighthq/platform

Environment identification — OS name, family, architecture, runtime shell, and engine — through explicit web/native providers.

`platform` is the **root identification seam** of the desktop/mobile integration suite. Every environment query takes a `HostPlatformProvider` directly. `@flighthq/host-web` exports the ready-made `webHostPlatform`; Electron, Tauri, Capacitor, and native shells pass their own provider. There is no module-global provider selection. Snapshot reads fill an `out` value and return it. Unknown or unavailable fields resolve to sentinels (`''` / `-1` / `'unknown'` / `false`), never throwing.

This package answers _what host am I running on_. Live, event-bearing, or richer concerns live in their own cells (see the delegation table) — `PlatformInfo` is a static identity snapshot.

## Functions

| Function | Purpose |
| --- | --- |
| `comparePlatformVersions(a, b)` | Compare two dotted version strings numerically, segment by segment. Returns `-1` / `0` / `1`; `''` sorts lowest. |
| `getPlatformEngine(provider)` | Return the browser engine family. Convenience over `getPlatformInfo`. |
| `getPlatformInfo(provider, out)` | Fill `out` with the running platform's identity snapshot and return it. |
| `getPlatformKind(provider)` | Return the platform family (`desktop` / `mobile` / `web` / `unknown`). Convenience over `getPlatformInfo`. |
| `getPlatformName(provider)` | Return the OS/runtime name. Convenience over `getPlatformInfo`. |
| `getPlatformRuntime(provider)` | Return the host shell / runtime environment. Convenience over `getPlatformInfo`. |
| `isPlatformDesktop(provider)` | `true` on a desktop host (Electron/Tauri/native window shell). |
| `isPlatformMobile(provider)` | `true` on a mobile host (iOS/Android via Capacitor or a native shell). |
| `isPlatformNative(provider)` | `true` when running inside a host shell, not a plain browser page. |
| `isPlatformTouch(provider)` | `true` on a touch-primary device, independent of desktop/mobile classification. |
| `isPlatformVersionAtLeast(provider, minimum)` | `true` when the live OS version is at or above `minimum`. `false` when the version is `''`. |
| `isPlatformWeb(provider)` | `true` when running as a plain web page. |

`@flighthq/host-web` also exports `createWebPlatformBackend()` for callers that need a fresh Web provider.

## `PlatformInfo` fields

`PlatformInfo` carries 14 fields. The Web provider fills it from the user-agent string, `navigator`, and runtime probes; native providers fill the same shape from OS APIs. Fields a web page cannot honestly report resolve to a sentinel rather than guessing.

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

`osBuild`, `distro`, and `distroVersion` exist in the shape so a native provider can fill them without a breaking type change. The Web provider cannot honestly report them, so it returns `''`; they stay empty until a native host provides them. Treat `''` here as **native-reserved**, not an error.

## Cross-package delegation

`platform` reports only host **identity**. Richer or live concerns belong to their own cells; reach for these rather than expecting them on `PlatformInfo`:

| Concern | Owner | Why not here |
| --- | --- | --- |
| Device model, manufacturer, memory, safe-area insets | `@flighthq/device` | Hardware/device identity is a distinct, larger snapshot. |
| Battery, charging, low-power, keep-awake | `@flighthq/power` | Live, event-bearing state — not a static snapshot. |
| Display enumeration, work area, scale factor | `@flighthq/screen` | Multi-display geometry is its own live surface. |
| App name/version, quit/relaunch, single-instance lock | `@flighthq/app` | Application/process identity, not host identity. |

The UA-string parsing primitives (`parseUserAgent*`, `probeEndianness`) live in `@flighthq/useragent`, the shared value-leaf both Web providers build on.

## Usage

```ts
import { getPlatformName, isPlatformVersionAtLeast } from '@flighthq/platform';
import { webHostPlatform } from '@flighthq/host-web';

console.log(getPlatformName(webHostPlatform));

if (isPlatformVersionAtLeast(webHostPlatform, '10.15')) {
  // gate a feature on a minimum OS version
}
```
