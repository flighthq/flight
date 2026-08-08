---
package: '@flighthq/easing'
updated: 2026-08-08
by: principal
---

# easing — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/easing/src/` on 2026-08-08. The package is close to
complete — 51 exports on the public lane, the guard seam installed, and the whole
combinator/parametric/LUT layer present — so this list is short on purpose.

- **The spring boundary is still unanswered, and it blocks a whole vocabulary.** `easeSpring`,
  `SpringEasingOptions`, and `solveSpringDuration` do not exist anywhere in `packages/`.
  `@flighthq/spring` is a *time-domain* integrator (`spring/src/spring.ts` exports `createSpring` /
  `updateSpring` / `isSpringSettled`) with no normalized `[0,1] → [0,1]` form and no settle-time
  estimate, so neither package owns the curve. Until it is ruled, the preset vocabulary a user expects
  — `easeGentleSpring`, `easeWobblySpring`, `easeStiffSpring`, `easeSlowSpring` — has nowhere to land;
  each is a one-liner once `easeSpring` exists. This is a design decision for the user, not a task.
- **Back and Elastic are baked constants with no parametric form.** `easeBack.ts` and `easeElastic.ts`
  export three `EasingFunction` constants each and nothing else; there is no `easeInBackWith(overshoot)`
  or `easeInElasticWith(amplitude, period)`. `easePower.ts` is the only family that takes a parameter,
  so overshoot and oscillation are the two curves a user cannot tune.
- **No single-jump `easeStep(threshold?)`** alongside `easeSteps` (`easeSteps.ts:16`) — the CSS
  `step-start` / `step-end` convenience.
- **No `@flighthq/easing-formats` neighbour.** There is no `parseCssEasingFunction` /
  `serializeEasingToCss`; a string→function registry would fight tree-shaking inside the core package,
  which is why it is a neighbour and why it waits for a real consumer (scene serialization, theme
  files) rather than being built speculatively.
- **Nothing asserts the performance and determinism properties the package claims.** No bench asserts
  the fixed curves stay allocation-free, and nothing pins `createEasingSamples`
  (`createEasingSamples.ts:17`) as bit-reproducible, which is what would make it a conformance probe
  for a port. `vitest bench` is not configured in this workspace.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The entire 2026-06-25 entry checked out
  **false**: it declared this worktree "at an earlier state" with `easeCombinators.ts`, `easePower.ts`,
  `easePiecewise.ts`, `createEasingSamples.ts`, `getEasingDerivative.ts`, `easeStep`, and
  `easeSmoothstepRange` all "not present," and parked three Recommended items on that basis. Five of
  those files exist and are exported through `contract.ts`, and `easeSmoothstepRange`
  (`easeSmoothstep.ts:15`) landed with the `ScalarRemap` return type the parked item asked for
  (`types/src/ScalarRemap.ts:1`). Only `easeStep` is genuinely absent, and it survives above. The
  `easeSteps(1, 'jumpNone')` NaN is no longer a documented sharp edge either: it routes through
  `setEasingStepsGuard` (`easeSteps.ts:37`), which `enableEasingGuards` turns into a `@flighthq/log`
  warning — the diagnostics inversion, done.
- **2026-06-25** — `easeSteps(1, 'jumpNone')` divide-by-zero documented and pinned by test.
- **2026-06-24** — Combinators, parametric power family, piecewise splice, LUT sampling, and the
  numerical derivative added; `Readonly<EasingFunction>` dropped everywhere, since `Readonly<>` on a
  function type strips its call signature and makes the parameter uncallable.
