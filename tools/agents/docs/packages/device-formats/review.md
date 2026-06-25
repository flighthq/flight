---
package: '@flighthq/device-formats'
status: stub
score: 22
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/device-formats/ source + tests
  - packages/device-formats/ hunks of changes.patch
  - charter.md (stub)
  - structural-forks.md, register.md, CONTRACT.md, index.md
---

# device-formats — Review (merge gate: integration-b2824e3d8 → origin/main eb73c3d74)

Evidence: `incoming/integration-b2824e3d8/head/packages/device-formats/` (the package does **not** exist in `base/` — this is a net-new package) + the `packages/device-formats/` hunks of `changes.patch`. Findings reference `b2824e3d8:<path>`. The charter is a stub (`_TODO — NEW package … Decide whether it should exist before authoring intent._`), so the rubric falls back to the codebase-map AAA standard **and** the blessed SDK-wide rulings in `structural-forks.md` / `register.md`, both of which speak to this exact package by name.

## Verdict

`stub — 22/100`. **Reject the package boundary; keep the parser code.** The change adds a clean, well-tested, side-effect-free set of three UA-string parsers — and homes them in a package the SDK's own blessed structural register has already **rejected**. `register.md:30` records the verdict verbatim: "`device-formats` | **rejected** — blood-from-a-stone: split a subject with no plurality, misnamed (`-formats` on a UA string) … | collapse into **`useragent`**", and `structural-forks.md:22` names it as the canonical failure of the plurality guard ("`device-formats`/`platform-formats` failed exactly this: they split a subject with no plurality"). On top of the boundary verdict, the delta as presented **does not compile**: every function depends on `DeviceFormFactor*` symbols that exist nowhere in `@flighthq/types`. The 22 is not a grade on the parser craft (which is good) — it is the distance from "a package worth merging." The merge-correct outcome is to land the _parsers_ inside a single `useragent` value-leaf shared by the `device` and `platform` web backends, not to admit `@flighthq/device-formats` as a package.

## What the delta adds (verified against source)

- `b2824e3d8:src/userAgentParse.ts` — three pure parsers: `parseUserAgentFormFactor(ua, maxTouchPoints) → DeviceFormFactor`, `parseUserAgentOsName(ua) → string` (`'' ` sentinel), `parseUserAgentOsVersion(ua) → string` (`'' ` sentinel). No DOM, no globals, no module state — the header comment is accurate.
- `b2824e3d8:src/index.ts` — thin barrel re-exporting exactly those three.
- `b2824e3d8:src/userAgentParse.test.ts` — 3 `describe` blocks, alphabetized and 1:1 with the three exports, ~30 cases covering each branch and the sentinel/unknown fallbacks. `vitest.config.ts` uses the `node` environment (correct — pure string logic, no jsdom needed).
- `b2824e3d8:package.json` — `sideEffects: false`, single `.` export, deps limited to `@flighthq/types`; shape is a faithful copy of the `platform-formats` manifest. `tsconfig.json` references only `../types`; `tsconfig.base.json` paths and `tsconfig.build.json` references are wired in head.

The internal craft is genuinely solid: full unabbreviated names (`parseUserAgentFormFactor`, not `parseUaFF`), `get*`-free pure parsing verbs read naturally, sentinel returns over throws (`b2824e3d8:src/userAgentParse.ts:61,82` return `''`; `:43` returns `DeviceFormFactorUnknown`), and the "best-effort, not exhaustive" caveat is documented in source rather than over-claimed. None of this is the problem.

## Merge blockers (grounded in the delta)

### 1. The package boundary is a blessed `rejected` — this is the load-bearing block

`device-formats` is not an open question; it has a recorded verdict in the approved baseline's register. `register.md:30` rejects it and mandates collapse into **`useragent`**; `register.md:36` defines the target: "`useragent` _(new primitive)_ — pure UA-string → identity-tokens value-leaf, depends only on `types`, used by the _web backends_ of `device` and `platform`." The reasons, all confirmed against this delta:

- **No plurality (blood-from-a-stone).** The triad plurality guard (`structural-forks.md:22`) forbids a `-formats` cell unless the subject has ≥2 formats. There is exactly one input here (a UA string) and one consumer-shaped slice of it. `b2824e3d8:src/index.ts` exports three parsers over one string — not two formats.
- **Split-by-consumer, not by subject.** `device-formats` and `platform-formats` are two halves of one UA parser, divided only by which runtime reads the result. `head/packages/device/src/device.ts:1` imports the form-factor/OS parsers from `@flighthq/device-formats` while `:2` imports `parseUserAgentArch` from `@flighthq/platform-formats` — the same `device` backend pulls from both halves, which is the tell that the cut is in the wrong place. The upstream-library oracle (`structural-forks.md:23`) is explicit: "No library for 'UA-parsing split by consumer' → not a subject."
- **Misnamed.** The bedrock test's honest-naming rule (`register.md:22`, `structural-forks.md:57-58`) is "a UA string is not a `-format`." `-formats` is the codec/file-format layer of the subject triad; UA parsing is neither a file format nor a codec.

This is _not_ a pre-release-latitude case to wave through: the question is "is this the final shape worth keeping," and the blessed answer is "no — collapse to `useragent`."

### 2. The delta does not compile — phantom `DeviceFormFactor*` imports (types-first violation)

`b2824e3d8:src/userAgentParse.ts:1-10` imports `import type { DeviceFormFactor }` plus the seven value constants `DeviceFormFactorCar / Desktop / Phone / Tablet / TV / Unknown / Watch` from `@flighthq/types`:

```ts
import type { DeviceFormFactor } from '@flighthq/types';
import {
  DeviceFormFactorCar,
  DeviceFormFactorDesktop,
  DeviceFormFactorPhone,
  DeviceFormFactorTablet,
  DeviceFormFactorTV,
  DeviceFormFactorUnknown,
  DeviceFormFactorWatch,
} from '@flighthq/types';
```

None of these symbols exist in the integration's `@flighthq/types`. `head/packages/types/src/Device.ts` defines `DeviceInfo` / `SafeAreaInsets` / `DeviceBackend` and **no** form-factor type or constant; a search of the entire `head/packages/types/` tree for `FormFactor` returns nothing, and `changes.patch` never adds them to types. The only occurrences of `DeviceFormFactor*` in the whole head tree are inside this package's own `userAgentParse.ts` / `userAgentParse.test.ts` and in `head/packages/device/src/device.ts:10` (`import { DeviceFormFactorUnknown } from '@flighthq/types'`) — which is itself broken for the same reason. This violates the "define its types in `@flighthq/types` first, then implement against them" header-layer rule (`index.md` Ground Rules): the `DeviceFormFactor` contract was implemented against but never authored in the header. As presented, `device-formats` cannot typecheck.

(Note: the `import/no-unresolved` and `import/no-relative-parent-imports` errors visible in `changes.patch` ~lines 922/956 are integration-merge artifacts — head's final `tsconfig.base.json:46-47` does wire the `@flighthq/device-formats` path — so those lint lines are **not** scored here. The phantom-type non-compile above is a real source defect, independent of wiring.)

## What is _not_ a defect in this delta (adversarial self-check)

- **Duplicate `parseUserAgentArch`** — the register cites a duplicate `parseUserAgentArch` export shared with `platform-formats`, but that was from the prior `builder-67dc46d64` bundle. In _this_ head, `b2824e3d8:src/index.ts` exports only `parseUserAgentFormFactor / parseUserAgentOsName / parseUserAgentOsVersion`; `parseUserAgentArch` lives solely in `platform-formats` and `device` imports it from there. The duplicate-export defect is **resolved** in this delta and is not asserted against it.
- **Packaging/manifest shape, test layout, naming verbs, sentinels** — all correct (see above). The objection is to the package's _existence_, not its internals.

## Charter contradictions

The charter is an honest stub that pre-empts this review: "_NEW package from `builder-67dc46d64`; no Package Map entry yet. **Decide whether it should exist before authoring intent.**_" That decision has since been made in `register.md:30` — **reject, collapse to `useragent`** — so the charter should not be promoted; it should be retired when the `useragent` collapse lands. There is no blessed North star / Boundaries to contradict.

## Contract & docs fit

Lives up to the _code-level_ contract (unabbreviated names, sentinels, `Readonly` n/a for string params, `sideEffects: false`, single `.` export, no top-level side effects, `node` test env). Fails the _structural_ contract (a rejected boundary) and the _types-first_ contract (phantom `DeviceFormFactor`). The Rust mirror `crate: flighthq-device-formats` named in the charter front matter should also collapse — `register.md:36`'s `useragent` is wasm-mixable (fork D), so the crate target is `flighthq-useragent`, not `flighthq-device-formats`.

## Candidate open directions (for the charter / the user)

1. **Execute the `useragent` collapse.** Merge `device-formats` + `platform-formats` parsers into one `useragent` value-leaf (`register.md:36`). This is a cross-package structural fork that removes a package the `device` _and_ `platform` runtimes depend on — it needs the user's explicit bless before execution.
2. **Author the `DeviceFormFactor` contract in `@flighthq/types`** regardless of where the parsers land — the type + 7 constants must exist in the header before any consumer (device runtime or useragent leaf) compiles.
