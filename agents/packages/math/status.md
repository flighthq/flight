---
package: '@flighthq/math'
updated: 2026-08-08
by: principal
---

# math — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Short by design — the scalar toolbox is complete and every prior defect claim checked out fixed. What
remains is chartered-but-unbuilt work, verified against `packages/math/src/` on 2026-08-08.

- **Noise is blessed for this package but not built.** The 2026-07-02 Decision put value / gradient /
  simplex / fbm noise in `math` rather than a `@flighthq/noise` neighbor, and `hash.ts:22` already names
  hashing as "gradient noise seed generation". There is no `noise.ts` in `packages/math/src/` and no
  noise export in `contract.ts` (15 modules, none of them noise).
- **`randomColor` is blessed but absent.** The same-day Decision homed it here alongside `randomInt` /
  `randomGaussian`; a repo-wide grep over `packages/` finds no definition.
- **Particles still inlines two of the three duplicates the 2026-07-02 Decision named.**
  `particles/src/updateParticleObjects.ts:11` defines `const TWO_PI = Math.PI * 2` instead of importing
  `TAU`, and `:143` inlines scalar disc sampling (`Math.sqrt(state.random()) * config.emitterRadius`)
  instead of `randomInsideUnitDisc`. The `clamp01` copies the Decision also named are gone. Cross-package
  work — it edits `@flighthq/particles`, not this cell.
- **There is no `crates/` directory in this repo.** The `crate: flighthq-math` stamp and charter Open
  direction #1 point at the separate flight-rs repo, not at work reachable from this tree.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The entire 2026-06-25 entry checked out
  **false**: it claimed `packages/math/src/` had "regressed to a two-function stub" (`nextPowerOfTwo` +
  `random`) and parked all five Recommended items as targeting absent functions. The live tree carries
  all 15 modules — `angle`, `clamp`, `comparison`, `constants`, `hash`, `interpolation`,
  `interpolationAdvanced`, `nextPowerOfTwo`, `numberTheory`, `random`, `randomDistributions`,
  `randomRange`, `rounding`, `scalar`, `statistics` — barrelled from `contract.ts` with 73 names on the
  public lane. The `package.json` description Decision also landed (`package.json:46`).
- **2026-07-02** — Charter rulings recorded: noise stays in `math`, `randomColor` stays in `math`,
  `saturate` takes GPU NaN semantics while `clamp` propagates, particles should adopt `math` exports,
  and the package is a refactoring destination rather than a proactive expansion target.
- **2026-06-24** — Full Bronze/Silver/Gold scalar toolbox built out: constants, clamp/range,
  interpolation (basic + advanced), angles, rounding, number theory, comparison, statistics, hashing,
  and the random distribution family with alias-safe `out`-writing vector samplers.
