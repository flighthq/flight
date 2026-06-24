---
package: '@flighthq/platform'
updated: 2026-06-24
basedOn: ./review.md
---

# platform — Assessment

> Recommendation layer over `review.md`. Sorts the review's gaps — and the absorbed `reviews/maturation/depth/platform.md` Bronze/Silver/Gold roadmap — into sweep-safe **Recommended** (within `@flighthq/platform`, no cross-package coupling, no breaking change, no open design decision) and parked **Backlog** (cross-package, cross-tree, or waiting on an Open direction). `Approved` is the user's verbal gate and is left empty. Design forks and cross-package items are routed to the charter's Open directions, not into Recommended.
>
> **Roadmap absorbed.** The depth roadmap is largely _shipped_: Bronze is complete (`runtime`/`engine` fields + `getPlatformRuntime`/`getPlatformEngine`, UA-string `arch`/`version` fills, `iOs` typo, `_scratch` comment), and much of Silver/Gold landed this pass (`comparePlatformVersions`, `isPlatformVersionAtLeast`, `isPlatformNative`, `engineVersion`, canonical-token normalization, the `platform-formats` UA-parser neighbor, `endianness`/`pointerWidth`/`osBuild`/`distro`/`distroVersion` fields). What remains is one sweep-safe doc item plus a cluster of cross-package / cross-tree / design items — and the roadmap's own `platform-formats` Gold step is now _superseded_ by structural fork E (collapse into `useragent`), so it is parked-and-routed rather than recommended. The seed roadmap can be removed once this assessment lands.

## Recommended

Sweep-safe: lands entirely inside `@flighthq/platform`, breaks nothing, decides nothing the charter has not.

- **Add a package README — the canonical environment-identification reference.** A human-readable table enumerating every `PlatformInfo` field (all 14), its value space, its sentinel, and its web-vs-native source, plus the cross-package delegation table (`@flighthq/device`, `@flighthq/power`, `@flighthq/screen`, `@flighthq/app`). This is the Gold roadmap's "canonical reference the verdict asks for" reduced to its sweep-safe core: pure documentation of the _already-shipped_ surface, no code change, no decision. It also makes the honest-`''`-stub fields (`osBuild`/`distro`/`distroVersion`) explicitly documented as native-reserved rather than silently empty. — review.md#gaps, roadmap#gold ("Docs").

That is the whole sweep-safe set. The seam itself already reads at 80/100 in the review — fully-named, side-effect-free, sentinel-disciplined, one-test-per-export, every advertised field filled on web. The remaining open work is all either cross-package, cross-tree (Rust), or gated on a design decision the charter has not made, so it is parked below.

## Backlog

Parked — each is cross-package, cross-tree, larger-scope, or waiting on an Open direction. Reason given per item.

- **Resolve the `platform-formats` → `useragent` collapse.** The register (`register.md`, 2026-06-24, sourced from this very bundle) **rejects** `@flighthq/platform-formats` — "the other half of the same UA parser" — and mandates collapsing it (with `device-formats`) into a shared `useragent` value-leaf: `parseUserAgentArch` is exported from _both_ `platform-formats/src/userAgent.ts` and `device-formats/src/userAgentParse.ts`, and `-formats` is dishonest naming for a UA string (fails the triad plurality guard + honest-naming gate of structural fork E). **Parked + routed:** this removes a package the `platform` web backend depends on and pairs with the identical `device-formats` decision — the opposite of sweep-safe; it needs the user's explicit bless. The worker's status doc scored `platform-formats` as a Gold achievement; the SDK-wide ruling supersedes that, which is exactly why it is surfaced rather than actioned. This is the single largest thing separating the package from authoritative. — review.md#contract-&-docs-fit (1).

- **Async high-entropy resolve seam (`getPlatformInfoAsync` / `refreshPlatformInfo`).** The accurate web source for `version`/`arch`/`engineVersion`/`pointerWidth` is the Promise-based `navigator.userAgentData.getHighEntropyValues(...)`; the sync `getInfo` cannot fill it, so those fields are UA-string best-effort today. **Parked:** the status doc defers this pending a _suite-wide_ async-shape decision shared with `@flighthq/device` (same `userAgentData` problem). Adding the seam here unilaterally would set the suite precedent without coordination — a cross-package design decision, routed to Open directions. — review.md#gaps ("No async high-entropy resolve path"), roadmap#silver.

- **Native fillers for `osBuild` / `distro` / `distroVersion`.** The fields exist so a native backend can fill them without a breaking type change, but the only shipped backends (web + the Rust native crate) leave them `''`. **Parked:** filling them requires a native host (Linux `os-release`, OS build string), which does not exist in this codebase yet. Cross-tree / premature until a native backend lands. The Recommended README documents them as native-reserved in the interim. — review.md#gaps ("`osBuild`/`distro`/`distroVersion` are web stubs"), roadmap#gold ("Distribution / OS-detail fields").

- **`PlatformGraphics` capability block (`hasWebgl2`/`hasWebgpu`/`prefersReducedMotion`).** **Parked:** may belong in a render-capabilities seam (alongside `@flighthq/render` backend selection) rather than the OS-identification package — adding it risks scope creep into the renderer domain. A home decision, routed to Open directions; default to _not_ adding it to `platform` until no better home exists. — review.md#gaps ("`PlatformGraphics` capability block absent"), roadmap#gold.

- **Catch the Rust mirror up to the new surface.** `flighthq-platform` + `flighthq-types::PlatformInfo` still carry only the old six-field surface (`name`/`kind`/`version`/`arch`/`locale`/`is_touch`); TS grew eight new fields (`runtime`/`engine`/`engineVersion`/`endianness`/`pointerWidth`/`osBuild`/ `distro`/`distroVersion`) and five new functions (`comparePlatformVersions`, `isPlatformVersionAtLeast`, `getPlatformEngine`, `getPlatformRuntime`, `isPlatformNative`) that the crate does not mirror. **Parked:** lives in the Rust worktree / conformance track, not this TS package; conformance should _record this as drift_ rather than silence. Whether Rust catches up to the sync surface now or waits for the async seam to stabilize is itself an Open direction. Cross-tree, larger scope. — review.md#contract-&-docs-fit (2), roadmap#gold ("1:1 Rust parity").

- **Pin the canonical `arch` token set, shared with `@flighthq/device`.** `'x64'|'arm64'|'x86'|'arm'|'wasm'` is documented in `Platform.ts`, but cross-package agreement with `@flighthq/device`'s `arch` field is asserted by neither package's tests. **Parked:** a shared-types decision spanning two packages (the two must never disagree on the same concept), not a per-package one. Routed to Open directions. — review.md#candidate-open-directions, roadmap#sequencing.

## Routed to the charter's Open directions

Not assessment items — noted here for the charter pass (this skill does not edit the charter). The charter's North star / Boundaries / Decisions are all still `TODO`, and that emptiness is itself the finding: nearly every Backlog item rests on an assumption the charter should ratify. The questions that turn the stub into a real charter:

1. **The `platform-formats` → `useragent` collapse** (the load-bearing fork; bless or not — pairs with the identical `device-formats` decision). Reflect the collapse direction in Boundaries/Open directions so the next worker does not re-grow `platform-formats`.
2. **Where the suite's async high-entropy resolve seam lives**, and whether it is shared with `@flighthq/device` — bless or reject `getPlatformInfoAsync`/`refreshPlatformInfo` and name its owner.
3. **Whether `PlatformGraphics` belongs here** or in a render-capabilities seam.
4. **The canonical `arch` token set** and its required agreement with `@flighthq/device`.
5. **When Rust mirrors the new surface** — now (sync) or after the async seam stabilizes.
6. **What "Gold" means for a host-identity leaf** — so a future session does not re-spawn the rejected `platform-formats` neighbor and score it Gold on within-package completeness alone.

(One cell-hygiene flag from the review also belongs to the user, not this assessment: the codebase-map Package Map's `platform` one-liner now undersells the shipped surface — widen it, or leave it narrow and let the `useragent` collapse resolve the extra fields. It omits `@flighthq/platform-formats` entirely, which is consistent with that package's rejection.)

## Approved

_Frozen on the user's verbal approval only. None yet._
