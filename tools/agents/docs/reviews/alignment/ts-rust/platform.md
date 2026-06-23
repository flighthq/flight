# TS↔Rust Alignment: @flighthq/platform

**Verdict:** Effectively in sync — 10 of 11 exported functions map 1:1 by name, file, and convention; the lone delta (`createWebPlatformBackend` → `create_native_platform_backend`) is the documented ambient-default-backend flip, but it is only described as a general host-layer pattern, not recorded as a named function-level divergence.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `createWebPlatformBackend` (`src/platform.ts`) | `create_native_platform_backend` (`src/platform.rs`) | Intentional rename: rust/index.md host-layer says "TS's ambient default backend is web; Rust's ambient default is native/std," and lists `platform` among the std-served capabilities shipping a "native default backend in-crate." The Rust backend reads `std::env::consts`/`cfg!` instead of `navigator`, so `Web`→`Native` in the function name is correct. **Not a 1:1 name divergence to fix — but it is not an explicit entry in the conformance divergence map either.** `npm run rust:conformance` flags it as the single missing-function for `platform` (the same `createWeb*Backend` "miss" recurs across notification/power/protocol/etc.). Suggest adding one map entry covering the suite-wide `createWeb*Backend` → `create_native_*_backend` rename so this stops reading as drift. |

## In sync

The other 10 exports map by identity (camelCase→snake_case, full type word preserved), each in `platform.rs` ↔ `platform.ts`:

- `createPlatformInfo` ↔ `create_platform_info`
- `getPlatformBackend` ↔ `get_platform_backend`
- `getPlatformInfo` ↔ `get_platform_info`
- `getPlatformKind` ↔ `get_platform_kind`
- `getPlatformName` ↔ `get_platform_name`
- `isPlatformDesktop` ↔ `is_platform_desktop`
- `isPlatformMobile` ↔ `is_platform_mobile`
- `isPlatformTouch` ↔ `is_platform_touch`
- `isPlatformWeb` ↔ `is_platform_web`
- `setPlatformBackend` ↔ `set_platform_backend`

Conventions carry across correctly:

- **Package→crate name** is identity: `@flighthq/platform` → `flighthq-platform`.
- **File names** track: `platform.ts` ↔ `platform.rs`; both are barrel-re-exported (`index.ts` ↔ `lib.rs`).
- **Out-param** convention preserved: TS `getPlatformInfo(out)` returning `out` ↔ Rust `get_platform_info(out: &mut PlatformInfo) -> &mut PlatformInfo`.
- **Sentinel / nullable backend** preserved: TS `setPlatformBackend(backend: PlatformBackend | null)` ↔ Rust `set_platform_backend(backend: Option<Arc<dyn PlatformBackend>>)`; both lazily reinstall the default backend on next access when cleared.
- **No teardown verbs** apply here (no `dispose_`/`destroy_`/`acquire_`/`release_`), matching TS.
- **No extra Rust functions** — `lib.rs` re-exports exactly the 11 ported functions; the native detection helpers (`detect_native_platform_name`, `detect_native_locale`) are private, mirroring TS's private `getWebPlatformInfo`/`detectWebPlatformName`.
