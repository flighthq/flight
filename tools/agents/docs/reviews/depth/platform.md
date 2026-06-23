# Depth Review: @flighthq/platform

**Domain:** Runtime/OS environment identification — the root seam of the platform-integration suite. Answers "what am I running on?" (OS name, device kind, architecture, locale, touch) over a swappable host backend.

**Verdict:** solid — **72/100**

This is a deliberately narrow seam, not a sprawling capability library. Its docs scope is explicit: "root identification seam — OS name, desktop/mobile/web kind, arch, locale, touch." Judged against _that_ scope (not against a kitchen-sink "platform" library that bundles clipboard/fs/dialog — those are sibling packages by design), it is close to complete and internally clean. The score reflects a handful of genuine identification fields a mature environment-detection layer is expected to surface that are missing-by-omission, not the absence of unrelated capabilities (which is missing-by-design).

## Present capabilities

The exported surface (`packages/platform/src/platform.ts`):

- `createPlatformInfo()` — allocates a zeroed `PlatformInfo` value (out-param target / backend builder).
- `createWebPlatformBackend()` — the always-available web fallback backend.
- `getPlatformBackend()` — resolves the active backend, lazily creating the web default so there is always an answer.
- `setPlatformBackend(backend | null)` — installs a native host backend; `null` reverts to web. Opt-in, no import side effects.
- `getPlatformInfo(out)` — out-param fill of the full `PlatformInfo`.
- `getPlatformKind()` / `getPlatformName()` — convenience scalars (`PlatformKind`, `PlatformName`).
- `isPlatformDesktop()` / `isPlatformMobile()` / `isPlatformWeb()` — kind predicates.
- `isPlatformTouch()` — touch-primary predicate, independent of kind.

The web backend does real UA-based detection for android / ios / windows / macos / linux, derives `kind` from name, reads `navigator.language` for locale, and `navigator.maxTouchPoints` for touch. `PlatformInfo` carries `name`, `kind`, `version`, `arch`, `locale`, `isTouch`. Test coverage is one-per-export and exercises both backend-registered and fallback paths.

This hits the documented bar (OS name, kind, arch, locale, touch) and follows the suite's command-capability shape exactly: flat free functions + `get*Backend` / `set*Backend` / `createWeb*Backend`, sentinel-returning web guards (empty strings / `'unknown'` rather than throwing), `"sideEffects": false`, out-params, `Readonly`-friendly value type. As a _seam_, it is well-formed.

## Gaps vs an authoritative environment-identification library

Mature platform/environment-detection libraries (e.g. Node `os`, Electron `process`/`os`, Capacitor `Device`, Tauri `os` plugin, `platform.js`, `bowser`) consistently expose more identity surface than is here. Missing-by-omission within this package's own domain:

- **OS version is detected nowhere.** `version` exists on `PlatformInfo` but the web backend always sets it to `''`. Even on the web, UA / `navigator.userAgentData.getHighEntropyValues(['platformVersion'])` can supply it. Right now version is a field a native backend _could_ fill but the shipped implementation never does.
- **Architecture is never detected on web** (`arch` always `''`). `navigator.userAgentData` (`architecture`, `bitness`) or UA heuristics (`x86_64`, `arm`, `WOW64`) are the canonical web sources.
- **No engine / runtime distinction.** No way to tell Electron vs Tauri vs Capacitor vs plain browser, nor browser engine (Blink/Gecko/WebKit). Authoritative libs surface a runtime/engine field; here "web" collapses every non-native host into one bucket.
- **No version comparison / parsing helpers.** Libraries in this space typically offer `satisfies` / semver-style comparison or at least numeric major/minor access. The doc comment explicitly disclaims this ("Never parsed for semantics here"), so it is a stated design boundary rather than an oversight — but it is a real capability an authoritative version of this domain provides.
- **No 64-bit / pointer-width or endianness signal** beyond the (unfilled) `arch` string — common in native-targeting identification layers and relevant to the planned C/C++ port.
- **No memory / core-count / hardware identity** — but this is correctly _missing-by-design_: the docs route static device identity (model, manufacturer, memory, safe-area) to `@flighthq/device` and live battery to `@flighthq/power`. Not a gap for this package.
- **No async identity path.** `getInfo` is sync, which is right for native std, but the web `userAgentData` high-entropy APIs that would fill `version`/`arch` are Promise-based. There is no seam for a backend that needs to resolve identity asynchronously, which is what blocks the version/arch gaps above on the web.

## Naming / API-shape notes

- Naming is fully canonical and self-identifying: every function carries the `Platform` type word (`getPlatformInfo`, `isPlatformTouch`), predicates use `is*`, the backend trio matches the suite convention. No abbreviations. Exports are alphabetized; loose state (`_backend`, `_scratch`) sits at the bottom.
- The shared `_scratch` `PlatformInfo` used by `getPlatformKind` / `getPlatformName` / `isPlatformTouch` is a sensible no-alloc convenience but is module-level mutable state read on every scalar call. It is single-threaded-safe in JS and never escapes, so it is acceptable, but worth a note for the Rust/native port where a per-call local or thread-local is the equivalent.
- Minor: doc comment typo "iOs" (should be "iOS") on `isPlatformMobile`.
- `PlatformInfo` lives correctly in `@flighthq/types` as the header; the package depends only on `@flighthq/types`. Clean cellular shape.

## Recommendation

Keep the verdict at **solid**. The package is the right shape and complete _as a seam_, but two of the six `PlatformInfo` fields it advertises (`version`, `arch`) are dead on the only shipped backend — that is the main thing holding it back from authoritative within its own narrow domain. To close the gap without scope creep:

1. Fill `arch` and `version` in the web backend via `navigator.userAgentData` (with UA-string fallback), which likely requires adding an async identity path or a lazy-refresh so the high-entropy values can be resolved.
2. Add a runtime/engine signal (browser engine + host kind such as electron/tauri/capacitor) — either a new `PlatformInfo` field or a sibling predicate set — so "web" is not the only non-native classification.
3. Consider lightweight version-comparison helpers (or explicitly affirm the no-parse boundary in the docs as a permanent design decision).
4. Fix the "iOs" typo.

None of these require reaching across package boundaries; they deepen the existing seam rather than absorb sibling capabilities.
