---
package: '@flighthq/platform'
crate: flighthq-platform
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# platform — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/platform` is the **root identification seam** of the platform-integration suite — it answers "what am I running on?" Its surface is a single value type, `PlatformInfo` (name, kind, version, arch, locale, isTouch, runtime, engine, engineVersion, endianness, pointerWidth, osBuild, distro, distroVersion), filled by a swappable `PlatformBackend`. A lazy web backend parses the value out of `navigator`/UA; native hosts replace it via `setPlatformBackend`. The package is a thin, side-effect-free command capability: 16 O(1) delegating functions (backend trio + lifecycle, convenience scalars, `is*` predicates, version-compare helpers) over the backend, with `out`-param fills and sentinel returns.

Where it ends: `platform` reports the _static identity_ of the environment. Live, changing host concerns belong to siblings — battery to `@flighthq/power`, network status to `@flighthq/network`, app active/background to `@flighthq/lifecycle`. Per-device hardware identity (model, manufacturer, memory, safe-area insets) is `@flighthq/device`'s job; `platform` is the OS/runtime layer beneath it. Renderer-capability detection (WebGL2/WebGPU availability) is, today, deliberately _not_ here.

## North star (proposed)

- **A pure identification seam, not a control surface.** `platform` only reports — it never acts on the host. Every function reads `PlatformInfo`; nothing mutates the environment. Side-effect-free at import, lazy web backend, opt-in native replacement via `setPlatformBackend`.
- **One value type, fully named, fully documented.** `PlatformInfo` lives header-first in `@flighthq/types` with every field's value space, sentinel, and source spelled out. The package depends only on `@flighthq/types`. Function names carry the full `Platform` type word; `get*`/`is*`/`compare*` verbs are canonical.
- **Sentinels over throws, honest stubs over lies.** Unknown fields return `''`/`'unknown'`/`-1`/`false` on the web guard path — never a throw. A field a backend cannot fill (e.g. `osBuild` on web) is an honest empty stub reserved for a native fill, not a fabricated value.
- **Static identity only; live concerns live elsewhere.** What `platform` reports does not change during a run. Anything that does (battery, network, lifecycle) is a sibling capability, not a field here.
- **The authoritative spec is TS; Rust conforms.** `flighthq-platform` mirrors the TS surface 1:1; any lag is recorded as drift in the conformance map, not treated as an independent design.

## Boundaries (proposed)

In scope:

- The `PlatformInfo` value type and its backend seam (`createWebPlatformBackend`, `get*/setPlatformBackend`, `createPlatformInfo`, `getPlatformInfo(out)`).
- Convenience scalar readers and `is*` predicates over the live info.
- Version comparison helpers (`comparePlatformVersions`, `isPlatformVersionAtLeast`).
- A lazy web backend that fills every field it honestly can from `navigator`/UA.

Non-goals (proposed):

- Live/changing host state — battery, network, lifecycle, screen geometry (sibling packages own these).
- Hardware/device identity — model, manufacturer, memory, safe-area insets (`@flighthq/device`).
- Acting on the host — no quit, focus, dialogs, clipboard, etc. (other suite capabilities).
- Owning a UA-string parser as a published neighbor: per structural fork E the `platform-formats` parsers are slated to collapse into a shared `useragent` primitive (see Open directions) — `platform` consumes that, it does not export it.

## Decisions

None blessed yet.

## Open directions

Every candidate question below is unresolved and awaits your direction. Several rest on SDK-wide structural forks that touch this package.

- **Does `@flighthq/platform-formats` survive, or collapse into a shared `useragent` primitive?** Structural fork E (the bedrock / honest-naming test) and the register both record `platform-formats` as **rejected** — its parsers duplicate `device-formats` (`parseUserAgentArch` is exported from both), and a UA string is not a serialized container format with a codec, failing the triad plurality guard and honest-naming gate. The proposed resolution is a pure UA-string→identity-tokens `useragent` value-leaf depending only on `types`, consumed by the _web backends_ of both `platform` and `device`. This is the single largest shape question and pairs with the identical `device-formats` decision. The charter must settle it before any further `-formats` work so a future worker does not re-grow the package.
- **Where does the async high-entropy resolve seam live, and is it shared with `@flighthq/device`?** Accurate web `version`/`arch`/`bitness` requires `navigator.userAgentData.getHighEntropyValues(...)`, which is Promise-based; there is no `getPlatformInfoAsync`/`refreshPlatformInfo` / optional `PlatformBackend.getInfoAsync?` today. The status doc defers this (Silver) pending a suite-wide async-shape decision. Bless or reject the async seam and name its owner.
- **Does `PlatformGraphics` (`hasWebgl2`/`hasWebgpu`/`prefersReducedMotion`) belong here, or in a render-capabilities seam?** Currently held pending a cross-package decision. The charter should decide the home.
- **What is the canonical `arch` token set, and must it agree with `@flighthq/device`?** `'x64'|'arm64'|'x86'|'arm'|'wasm'` is documented in `Platform.ts`, but cross-package agreement is asserted by neither package's tests. Settle the canonical set and whether it is shared.
- **Should `osBuild`/`distro`/`distroVersion` stay as advertised-but-web-stub fields, or wait for a native filler?** They exist so a native backend can fill them without a breaking type change, but no shipped backend (web or Rust native) fills them today — the same advertised-but-unfilled shape the prior review penalized `version`/`arch` for. Confirm they are intentionally reserved.
- **When does Rust mirror the new surface?** `flighthq-platform` / `flighthq-types::PlatformInfo` still carry only the old six-field surface; TS grew eight fields and five functions this pass. State whether Rust waits for the async seam or catches up to the sync surface now, and record the lag as conformance drift.
- **Should the codebase-map Package Map one-liner widen to reflect the shipped surface** (runtime/engine/endianness/pointerWidth/version-compare), or stay narrow and let the `useragent`/`device` overlap fork absorb the extra fields? (Doc-revision question for the user's gate.)
