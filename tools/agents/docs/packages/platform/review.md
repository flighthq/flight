---
package: '@flighthq/platform'
status: solid
score: 80
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/platform.md
  - source
  - changes.patch
  - structural-forks.md
  - register.md
---

# platform — Review

## Verdict

**solid — 80/100.** As a _seam_ the package is now excellent: a thin, side-effect-free, fully-named command capability over a swappable `PlatformBackend`, with every advertised `PlatformInfo` field actually filled on the web backend (closing the two dead-field gap the prior depth review flagged). The score is held back not by the seam but by two cross-cutting facts: the `@flighthq/platform-formats` neighbor this pass introduced has since been **rejected** by SDK-wide structural fork E (it should collapse into a shared `useragent` primitive), and the Rust mirror has **drifted** — `flighthq-platform` and `flighthq-types::PlatformInfo` still carry only the old six-field surface while TS grew eight new fields and five new functions.

## Present capabilities

`@flighthq/platform` (`67dc46d64:packages/platform/src/platform.ts`) — 16 exported functions, all O(1) delegation over the backend:

- **Backend trio + lifecycle:** `createWebPlatformBackend`, `getPlatformBackend` (lazy web fallback), `setPlatformBackend(backend | null)`, `createPlatformInfo` (zeroed struct, all 14 fields), `getPlatformInfo(out)` (out-param fill).
- **Convenience scalars:** `getPlatformName`, `getPlatformKind`, `getPlatformRuntime`, `getPlatformEngine` — each reads a shared module-level `_scratch` `PlatformInfo`.
- **Predicates:** `isPlatformDesktop`, `isPlatformMobile`, `isPlatformWeb`, `isPlatformNative` (`runtime !== 'web' && !== 'unknown'`), `isPlatformTouch`.
- **Version helpers (new this pass):** `comparePlatformVersions(a, b): -1 | 0 | 1` (numeric, segment-wise, `''` sorts lowest, alias-free) and `isPlatformVersionAtLeast(minimum)` (reads live version; `false` when version is `''` — the conservative default).

The web backend (`getWebPlatformInfo`) now fills **every** `PlatformInfo` field: `name`/`kind`/ `version`/`arch` from UA parsing, `locale` from `navigator.language`, `isTouch` from `maxTouchPoints`, `runtime` from window-global probes, `engine`/`engineVersion` from UA regex, `endianness` from a `DataView` probe, `pointerWidth` derived from `arch`; `osBuild`/`distro`/ `distroVersion` are honest `''` web stubs reserved for native host fills.

`@flighthq/platform-formats` (`67dc46d64:packages/platform-formats/src/userAgent.ts`) — nine pure, DOM-free, tree-shakable parsers: `parseUserAgentArch`, `parseUserAgentEngine`, `parseUserAgentEngineVersion`, `parseUserAgentKind`, `parseUserAgentName`, `parseUserAgentPointerWidth`, `parseUserAgentRuntime` (takes an explicit `win` for testability), `parseUserAgentVersion`, `probeEndianness`. Ordering hazards are handled and commented (arm64 before arm; Firefox before blink before webkit; Edg/OPR before Chrome; android before linux).

Types (`67dc46d64:packages/types/src/Platform.ts`) — `PlatformInfo` carries all 14 fields, each documented with value space + sentinel + source; new union types `PlatformRuntime`, `PlatformEngine`, `PlatformEndianness`; `PlatformBackend.getInfo(out)`. Correctly header-first.

Test coverage is strong and one-per-export: `platform.test.ts` has 69 `it` blocks across all 16 exports plus nested web-backend UA-detection suites (arch, engine, engineVersion, pointerWidth, version, endianness) and a canonical-token-normalization suite over five representative UAs; `userAgent.test.ts` has 54 across all nine parsers with edge cases (empty UA, null window, partial tokens). `describe` blocks are alphabetized and mirror exports.

## Gaps

- **No async high-entropy resolve path.** `version`/`arch`/`engineVersion`/`pointerWidth` are UA-string best-effort; `navigator.userAgentData.getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'fullVersionList'])` is the accurate web source but is Promise-based, and there is no `getInfoAsync`/`refreshPlatformInfo` seam. The status doc defers this (Silver) pending a suite-wide async-shape decision shared with `@flighthq/device` — a real, correctly- surfaced gap, not an oversight.
- **`osBuild`/`distro`/`distroVersion` are web stubs with no native filler in this codebase.** The fields exist so a native backend can fill them without a breaking type change, but the only shipped backend (web) and the Rust native backend both leave them empty — they are presently advertised-but-unfilled everywhere, the same shape the prior review penalized `version`/`arch` for before this pass fixed those.
- **`PlatformGraphics` capability block** (`hasWebgl2`/`hasWebgpu`/`prefersReducedMotion`) absent — correctly held pending a cross-package decision on whether renderer-capability detection belongs here or in a render-capabilities seam.

## Charter contradictions

The charter's `North star`, `Boundaries`, `Decisions`, and `Open directions` are all `TODO` stubs; only `What it is` is seeded ("root identification seam — OS name, device kind, arch, locale, touch over a swappable host backend"). Against that one seeded sentence there is **no contradiction** — the package is exactly the seam it describes, and the verbose-but-explicit, sentinel-not-throw, side-effect-free shape matches the codebase-map command-capability convention precisely. The substantive tensions below land against the SDK-wide structural forks and the register, not against the (near-empty) charter; that emptiness is itself the finding for the charter layer to resolve.

## Contract & docs fit

Lives up to the contract on every mechanical axis:

- **Types header-first** — `PlatformInfo` + all unions in `@flighthq/types/Platform.ts`; packages depend only on `@flighthq/types` (and `platform` on `platform-formats`). Clean cellular shape.
- **Naming** — fully canonical and self-identifying; every function carries the `Platform` type word, predicates use `is*`, accessors `get*`, the backend trio matches the suite convention, no abbreviations. Exports alphabetized; loose `_backend`/`_scratch` at file bottom.
- **Sentinels not throws** — `''`/`'unknown'`/`-1`/`false`; no throws on the web guard path.
- **`out`-params, single root export, `sideEffects: false`** — all present and correct.
- The prior depth review's "iOs" typo and the dead `version`/`arch` web fields are **resolved**.

Two genuine fit problems, both structural rather than mechanical:

1. **`platform-formats` is rejected by structural fork E.** The register (`tools/agents/docs/packages/register.md`, 2026-06-24, sourced from this very bundle `builder-67dc46d64`) records `platform-formats` as **rejected — "the other half of the same UA parser"**, and `device-formats` alongside it, both to **collapse into a new `useragent` primitive** (a pure UA-string → identity-tokens value-leaf depending only on `types`, consumed by the _web backends_ of both `platform` and `device`). The fork's reasoning is verifiable against source: `parseUserAgentArch` is exported from **both** `platform-formats/src/userAgent.ts` **and** `device-formats/src/userAgentParse.ts` — the literal duplicate the register cites — and the `-formats` convention is dishonest here (a UA string is not a serialized container format with a codec; it is a string parsed into tokens, failing the triad plurality guard and the honest-naming gate). The worker's status doc presents `platform-formats` as a Gold achievement; the SDK-wide ruling supersedes that. This is the single largest thing separating the package from authoritative: the seam is right, but its new neighbor is mis-formed and slated for removal.

2. **Rust conformance has drifted.** A `flighthq-platform` crate exists (`67dc46d64:head/crates/flighthq-platform/src/platform.rs`) with a `NativePlatformBackend` over `std::env::consts`/`cfg!`, but it mirrors only the **old** surface: `PlatformInfo` in `flighthq-types::platform.rs` still has just `name`/`kind`/`version`/`arch`/`locale`/`is_touch`, and the crate exposes none of the eight new fields (`runtime`/`engine`/`engineVersion`/ `endianness`/`pointerWidth`/`osBuild`/`distro`/`distroVersion`) nor the five new functions (`comparePlatformVersions`, `isPlatformVersionAtLeast`, `getPlatformEngine`, `getPlatformRuntime`, `isPlatformNative`). This pass touched `Platform.ts` in TS-types but did **not** touch `crates/flighthq-types/src/platform.rs`'s `PlatformInfo` (the patch's only edit to that file is the unrelated `Screen*` block). The status doc frames Rust parity as "deferred by instruction," which is a reasonable sequencing call — but the TS surface is now materially ahead of the authoritative-mirror crate, and conformance should record it as drift, not silence.

**Candidate doc revisions** (the user's gate, not mine):

- The codebase-map Package Map describes `platform` as "root identification seam — OS name, desktop/mobile/web kind, arch, locale, touch" and does not list `@flighthq/platform-formats` at all. That one-liner now undersells the shipped surface (runtime/engine/endianness/pointerWidth/version-compare). Consider widening it, _or_ leaving it narrow and treating the extra fields as something the `useragent`/`device` overlap fork resolves.
- The register's `useragent`-collapse direction should be reflected in the `platform` charter's (empty) Boundaries/Open directions so the next worker does not re-grow `platform-formats`.

## Candidate open directions

The charter is a stub, so nearly every judgement above rests on an assumption the charter should ratify. Surfacing the questions:

- **Is `platform-formats` accepted or does it collapse into `useragent`?** Fork E says collapse; the charter is silent. This is the decision that most changes the package's shape — settle it before any further `-formats` work. (Pairs with the identical `device-formats` question.)
- **Where does the suite's async high-entropy resolve seam live**, and is it shared with `device`? `getPlatformInfoAsync` / `refreshPlatformInfo` over an optional `PlatformBackend.getInfoAsync?` is the only path to accurate web `version`/`arch`/`bitness`. The charter should bless or reject the async seam and name its owner.
- **Does `PlatformGraphics` (`hasWebgl2`/`hasWebgpu`/`prefersReducedMotion`) belong here** or in a render-capabilities seam? Currently held; the charter should decide the home.
- **What is the canonical `arch` token set**, and must it agree with `@flighthq/device`'s `arch`? `'x64'|'arm64'|'x86'|'arm'|'wasm'` is documented in `Platform.ts`; cross-package agreement is asserted by neither package's tests.
- **When does Rust mirror the new surface?** The TS type is now stable enough to port; the charter should state whether Rust waits for the async seam or catches up to the sync surface now.
