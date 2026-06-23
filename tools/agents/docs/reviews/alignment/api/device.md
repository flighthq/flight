# API Alignment: @flighthq/device

**Verdict:** Strongly aligned — a textbook command-capability seam that mirrors `@flighthq/platform` 1:1; only nitpicks remain (no `Readonly` on the stored backend, and a backend-method/free-function naming asymmetry inherited from `@flighthq/types`).

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `setDeviceBackend(backend: DeviceBackend \| null)` | The stored reference is not `Readonly<DeviceBackend>`. The map's Design Constraints say to apply `Readonly<T>` to stored references where mutation is not intended; this package never mutates the backend object, only swaps the slot. (Matches the `@flighthq/platform` sibling, so this is a suite-wide convention drift, not device-specific.) | Type as `Readonly<DeviceBackend> \| null` here and in the sibling command capabilities, or record the loose-backend convention deliberately. |
| Low | `DeviceBackend.getInfo` (type) vs free `getDeviceInfo` | The backend method is `getInfo` (the type word `Device` is dropped because the interface name already carries it), while the free function is `getDeviceInfo`. Inside the backend object the short name is defensible, but the asymmetry means the seam method and its delegating free function don't share a name. The same pattern exists in `PlatformBackend.getInfo`/`getPlatformInfo` and `Keyboard`'s `getInfo`. | Acceptable as-is given the type context; if tightening, name the method `getDeviceInfo` so seam and wrapper read identically. The type lives in `@flighthq/types` (`Device.ts`), so any change is a cross-package decision — surface, don't change unilaterally. |
| Info | `getDeviceInfo` / `getSafeAreaInsets` | `get*` accessors that take a required `out` and return it. This reads slightly unlike a pure getter, but it is the established snapshot-into-`out` pattern across the platform suite (`getPlatformInfo`, `getInfo` seams) and the allocation discipline is correct (no allocation; `create*` companions allocate). No change. | None — noted only to confirm it was checked. |

## Clean

- **Full, unabbreviated type words** in every export: `createDeviceInfo`, `createSafeAreaInsets`, `createWebDeviceBackend`, `getDeviceInfo`, `getSafeAreaInsets`, `getDeviceBackend`, `setDeviceBackend`. No `Info`/`Dev`/`SAI`-style abbreviations.
- **Globally unique names** — all `Device*`/`SafeArea*`-scoped; no collision with `@flighthq/platform`'s `Platform*` set or other siblings.
- **Allocation by verb is exact**: `create*` (and `createWeb*Backend`) allocate; `getDeviceInfo`/`getSafeAreaInsets` write into a caller-supplied `out` and allocate nothing, suitable for hot reuse. The `create*Info` doc comments explicitly position them as the `out` source.
- **Sentinels, never throws** — the web backend returns `''` / `-1` / `false` / zero insets for everything a web page cannot know, exactly per the platform-suite "guard and return sentinel" rule. No expected-missing case throws.
- **Verb consistency with the suite** — `create*Info` / `createWeb*Backend` / `get*Backend` / `get*Info` / `set*Backend` matches `@flighthq/platform` and `@flighthq/storage` command-capability shapes 1:1.
- **`import type {}` on its own line** (device.ts:1); cross-package types (`DeviceInfo`, `SafeAreaInsets`, `DeviceBackend`) are imported from `@flighthq/types` (`Device.ts`), not redefined inline.
- **No teardown-verb misuse** — no `dispose*`/`destroy*`/`acquire*`/`release*` present; none warranted (no GC roots or non-GC resources held).
- **Boolean/accessor prefixes correct** — no `get*` returns a boolean; the only booleans are data fields (`isVirtual`) on the type, properly `is*`-named.
- **Lazy, side-effect-free default backend** — `getDeviceBackend` lazily creates the web default; module top level only declares `_backend = null`, honoring `"sideEffects": false`.
- **Tests colocated and mirroring exports** — `device.test.ts` has one `describe` per exported function.
