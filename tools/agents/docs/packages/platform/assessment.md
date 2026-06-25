---
package: '@flighthq/platform'
updated: 2026-06-25
basedOn: ./review.md
---

# platform — Assessment (merge gate: integration-b2824e3d8)

> Recommendation layer over the merge-gate `review.md`. **Recommended** is sweep-safe only: lands entirely inside `@flighthq/platform`, breaks nothing, decides nothing the charter has not. **Backlog** is parked — cross-package, cross-tree, or gated on an Open direction, each with its reason. **Approved** is the user's verbal gate and stays empty. Design forks and cross-package items route to the charter's Open directions.
>
> The dominant finding this pass is a _merge mechanic_, not a feature gap: the integration head consumes an expanded `PlatformInfo` whose type definition is absent (the `@flighthq/types/Platform.ts` change was dropped between `67dc46d64` and `b2824e3d8`), so the delta does not compile. Restoring it is the gate; everything else is parked behind it.

## Recommended

Sweep-safe within `@flighthq/platform` — but note the two blocking items below are _not_ fully within-package (they touch `types` and a sibling), so they are stated as the merge gate, not as silent sweeps, and the worker in the integration sandbox must do them deliberately.

- **(BLOCKING) Restore the `PlatformInfo` type expansion in `@flighthq/types`.** Add `PlatformRuntime`, `PlatformEngine`, `PlatformEndianness` unions and the eight new `PlatformInfo` fields (`runtime`, `engine`, `engineVersion`, `endianness`, `pointerWidth`, `osBuild`, `distro`, `distroVersion`) to `packages/types/src/Platform.ts` so the head `platform.ts`/`userAgent.ts` consumers and their tests typecheck. This is the types-first half of the change that was lost in the integration merge. Strictly it spans into `types`, so it is the gate, not a within-`platform` sweep — but without it `platform` cannot build at all. — review.md#standard-by-standard (6), #verdict.

- **Add a package README — the canonical environment-identification reference** (deferred until the type surface compiles). A table of every `PlatformInfo` field, its value space, sentinel, and web-vs-native source, documenting `osBuild`/`distro`/`distroVersion` as native-reserved `''`. Pure docs over the shipped surface, no code change, no decision. — review.md#gaps.

That is the within-package sweep-safe set. The seam itself is otherwise excellent and earns its prior 80 the moment it compiles; the rest of the open work is cross-package, cross-tree, or gated on a charter decision.

## Backlog

Parked — each is cross-package, cross-tree, larger-scope, or waiting on an Open direction.

- **Resolve the `platform-formats` → `useragent` collapse (do not merge `platform-formats` as a survivor).** `register.md:31` and structural fork E **reject** `@flighthq/platform-formats` ("the other half of the same UA parser"; fails the triad plurality guard; `-formats` is dishonest for a UA string; `parseUserAgentArch` duplicates `device-formats`). The fix is to collapse `platform-formats` (with `device-formats`) into a shared `useragent` value-leaf consumed by the _web backends_ of `platform` and `device`. **Parked + routed:** removes a package the `platform` web backend depends on and pairs with the identical `device-formats` decision — the opposite of sweep-safe; needs the user's explicit bless. — review.md#standard-by-standard (5).

- **Async high-entropy resolve seam (`getPlatformInfoAsync`/`refreshPlatformInfo`).** Promise-based `navigator.userAgentData.getHighEntropyValues(...)` is the accurate web source for `version`/`arch`/`engineVersion`/`pointerWidth`. **Parked:** a suite-wide async-shape decision shared with `@flighthq/device`; adding it here unilaterally sets the precedent without coordination. Routed to Open directions. — review.md#gaps.

- **Native fillers for `osBuild`/`distro`/`distroVersion`.** **Parked:** requires a native host (Linux `os-release`, OS build string) that does not exist in this codebase; cross-tree / premature. The Recommended README documents them as native-reserved in the interim. — review.md#gaps.

- **`PlatformGraphics` capability block (`hasWebgl2`/`hasWebgpu`/`prefersReducedMotion`).** **Parked:** may belong in a render-capabilities seam rather than the OS-identification package; a home decision, routed to Open directions. Default to not adding it here. — review.md#gaps.

- **Catch the Rust mirror up to the new surface.** `flighthq-types::PlatformInfo` + `flighthq-platform` carry only the old six-field surface; the eight new fields and five new functions are unmirrored. **Parked:** lives in the Rust worktree / conformance track; record as drift, not silence. Whether Rust catches up now or after the async seam stabilizes is itself an Open direction. — review.md#gaps.

- **Pin the canonical `arch` token set, shared with `@flighthq/device`.** `'x64'|'arm64'|'x86'|'arm'|'wasm'` is documented but cross-package agreement is asserted by neither package's tests. **Parked:** a shared-types decision spanning two packages. Routed to Open directions. — review.md#gaps.

## Routed to the charter's Open directions

Not assessment items — for the charter pass (this skill does not edit the charter). The charter's `North star`/`Boundaries`/`Decisions` are still `TODO`, and that emptiness is the finding: nearly every Backlog item rests on an assumption the charter should ratify.

1. **The `platform-formats` → `useragent` collapse** (the load-bearing fork; pairs with `device-formats`). Reflect the collapse in Boundaries/Open directions so a future worker does not re-grow `platform-formats`.
2. **Where the suite's async high-entropy resolve seam lives**, and whether it is shared with `@flighthq/device`.
3. **Whether `PlatformGraphics` belongs here** or in a render-capabilities seam.
4. **The canonical `arch` token set** and its required agreement with `@flighthq/device`.
5. **When Rust mirrors the new surface** — now (sync) or after the async seam stabilizes.
6. **What "Gold" means for a host-identity leaf** — so a future session does not re-spawn the rejected `platform-formats` neighbor and score it Gold on within-package completeness alone.
7. **Process: how does a types-layer commit get dropped on integration without a build gate catching it?** This delta shipped a consumer of undeclared types into an "approved" integration head. A doc/charter note on requiring `npm run typecheck` green on the integration branch before review would prevent recurrence.

## Approved

_Frozen on the user's verbal approval only. None yet._
