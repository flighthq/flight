---
package: '@flighthq/platform'
updated: 2026-08-08
by: principal
---

# platform — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/platform/src/` (and `packages/types/src/`) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **There is no async high-entropy resolve path.** `PlatformBackend` carries `getInfo` alone, and no
  `getInfoAsync` / `getPlatformInfoAsync` / `refreshPlatformInfo` exists anywhere in `packages/`. So
  `arch`, `version`, `pointerWidth`, and `engineVersion` stay UA-string best-effort even where
  `navigator.userAgentData.getHighEntropyValues` could answer exactly. The shape has to be decided
  jointly with `@flighthq/device`, which has the same problem — one async seam for the suite, not two.
- **`arch` is an unconstrained `string` in both packages that carry it** —
  `packages/types/src/Platform.ts:27-28` and `packages/types/src/Device.ts:9`. The canonical token set
  (`'x64'`, `'arm64'`, `'x86'`, `'arm'`, `'wasm'`) lives only in a comment, so nothing stops the two
  packages from spelling the same CPU differently and nothing detects it if they do.
- **`osBuild` / `distro` / `distroVersion` have no filler on any backend.** The web backend writes
  `''` by design (`platform.ts:164-167`), and the one native backend in the tree,
  `packages/host-electron/src/electronPlatform.ts:14-19`, sets only `name`, `kind`, `version`, `arch`,
  `locale`, and `isTouch` — it leaves those three, plus `engine`, `engineVersion`, `endianness`, and
  `pointerWidth`, at whatever the caller's `out` already held rather than at a sentinel.
- **`PlatformGraphics` (`hasWebgl2` / `hasWebgpu` / `prefersReducedMotion`) is unbuilt and unhomed.**
  Nothing by that name exists in `packages/`. The open question is whether renderer capability
  detection belongs here at all or in a capabilities seam beside `@flighthq/render`; do not add it
  here until that is settled.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: the parked
  "`platform-formats` → `useragent` collapse — needs the user's bless" — the collapse has happened.
  `packages/platform-formats` does not exist, and the web backend imports its parsers from
  `@flighthq/useragent/contract` (`platform.ts:9-19`). Also corrected the claim that native fillers
  need "a native host that does not exist in this codebase yet": `host-electron` exists and is a
  registered `PlatformBackend`; the gap is the fields it declines to fill, recorded above. The
  Rust-mirror item is gone — there is no `crates/` directory in this repo.
- **2026-06-25** — `packages/platform/README.md` added as the environment-identification reference:
  every `PlatformInfo` field with its sentinel and web source, plus the delegation table to
  `@flighthq/device` / `power` / `screen` / `app`.
- **2026-06-24** — UA parsing moved out of the seam into its own package so the churny table updates
  independently; `@flighthq/platform` stayed a thin O(1) delegation layer.
- **2026-06-24** — `endianness` (runtime `ArrayBuffer` probe, not arch-inferred), `pointerWidth`,
  `engineVersion` (product version — `Edg/`, `OPR/`, Safari `Version/` — not the shared Blink token),
  and the native-reserved `osBuild` / `distro` / `distroVersion` fields added.
- **2026-06-24** — `comparePlatformVersions` / `isPlatformVersionAtLeast` added, with `''` sorting
  lowest so an unknown version conservatively fails a minimum check.
