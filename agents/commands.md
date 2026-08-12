# Commands

The full npm-script reference: what each command does, and the long-form version of the checkpoint triggers summarized in [`AGENTS.md`](../AGENTS.md#checkpoints). Script naming follows the `action:subject:modifier` grammar in [npm script naming](conventions/npm-scripts.md).

### `npm run mocks` / `mocks:check` / `mocks:json`

Enforces the per-file mock scoping the root `vitest.config.ts` declares. The unit suite runs
`isolate: false` -- one shared module registry per worker, for a ~15x speedup -- and that is only safe
because each file scopes its own mocks. Two rules:

- **hoisted-mock** -- a top-level `vi.mock()` hoists above the file's imports and registers for the
  whole worker, so it leaks into every later file importing that module. Use `vi.doMock()` inside
  `beforeAll` plus a dynamic import of the subject.
- **orphan-unmock** -- a `vi.doUnmock('x')` naming a specifier the file never mocked. It unmocks
  nothing, which is worse than absent: it reads as cleanup that is happening.

Intentional escapes go in `ALLOW` in `scripts/mocks.ts` with a reason, the same shape as
`portable:check`. Runs as part of `npm run check`.

### `npm run untested` / `npm run unchecked` — the test-depth pair

Two reading tools, per-package, answering the two halves of one question. Neither gates, neither is part
of `npm run check`, and neither commits anything: they are lists you go and read, not scores.

- **`npm run untested <package>`** lists the branch arms **no test ever took**.
- **`npm run unchecked <package>`** takes the arms that _were_ taken and asks whether any test would
  **notice them breaking** — by editing one token of the source and re-running the tests.

The second exists because the first cannot answer it. `untested`'s own header records the measurement:
a cube reaches every arm of an axis-by-axis slab test while an axis-swap mutant inside it goes unnoticed,
and three diagonal-matrix tests covered `scaleMatrix4` at 100% while it scaled rows instead of columns —
a diagonal matrix cannot tell the two apart. Coverage sees green in both cases. A mutant does not.

Run `untested` first; it is seconds and it finds the cheaper problem. Reach for `unchecked` when a
package's coverage is already good and you want to know whether that means anything.

**What `unchecked` does.** It plans single-token edits — `<`→`<=`, `&&`→`||`, `===`→`!==`, `!x`→`x`,
`true`→`false` — filters them to lines the tests actually execute, and runs the package's suite once per
mutant. A mutant the tests still pass is a **survivor**: no test in that package distinguishes the real
behavior from the broken one.

    npm run unchecked geometry                    # the whole package
    npm run unchecked geometry/src/matrix.ts      # one file — start here
    npm run unchecked:json geometry               # the same findings as JSON

Two tiers, cheapest first: each mutant runs against its file's **sibling** `*.test.ts`, and only the ones
that survive that are re-run against the **whole package suite**. So a reported survivor has been missed
by every test in the package, not just by its colocated one.

**Cost.** One vitest process per mutant, eight at a time — minutes for a file, longer for a package.
That is the price of the safety property: the mutated text is served by a `load` hook and **never written
to disk**, so an interrupt at any moment — including `kill -9` — leaves the tree exactly as it was. The
faster design (rewrite the file, run, restore) can leave corrupted source behind at exactly the wrong
moment, which in a repo where an agent may be committing concurrently is not a risk worth the minutes.

**Three things a survivor does not mean**, each of which has produced a wrong reading somewhere:

1. It may be an **equivalent mutant** — an edit that changes the text without changing behavior, which no
   test could ever kill. `a > b` versus `a >= b` inside a `max` differs only when `a === b`. Detecting
   these is undecidable; judging them is the reader's job. This is why there is **no mutation-score
   percentage** here and why nothing gates on the count: a ratio whose achievable maximum is unknown is
   satisfied by deleting the mutants you cannot kill.
2. The scope is the package's **own** suite. A downstream package's tests may catch it. That is not a
   reprieve — a package whose own tests do not pin its behavior is the finding regardless, because the
   downstream test will move.
3. Conversely, a **kill** proves a test noticed, not that the test is good. A snapshot asserting the whole
   output kills nearly everything while explaining nothing.

**When it refuses.** A red suite fails on every mutant too, which reads as a perfect kill rate — so an
unmutated control run must pass before anything is measured. Every mutant run must also print a marker
proving the edit was actually applied; without it a passing suite tested unmutated source, which by exit
code alone is indistinguishable from a kill. Those runs are reported as `unreached` and excluded from the
list rather than counted either way.

**Worked example.** The first real run, on `geometry/src/plane.ts`: 88 reachable mutants, 19 survivors,
about five and a half minutes. The two ends of that list are what the tool is for, and they look identical
in the report — only reading the code separates them:

- `out.x = px - dist * plane.a` → `px + dist * plane.a`, in `getPlaneProjectedPoint`. A sign flip in a
  point-onto-plane projection: it projects to the mirrored point. All 23 tests still pass. That is a real
  hole, confirmed by hand.
- `a ?? 0` → `a || 0` in `createPlane`, four times over. These differ only when an argument is `NaN` or
  `-0`; for every other input, including the `undefined` the default exists for, the two are the same
  program. Effectively equivalent, and writing a test to kill them would buy nothing.

Same report, same shape, opposite worth. This is why the output is a list of addresses and not a score.

## Orientation commands

- `npm run fix` runs all auto-fixers in sequence: `lint:fix`, `order:fix`, then `format`. Run this after any edit session before committing.
- `npm run api` prints compact exported function signatures for all packages.
- `npm run api <query>` filters packages and exported functions by the given query. Example: `npm run api application` or `npm run api --function register`.
- `npm run api:json` prints the same API data as JSON for tools and agents.
- `npm run api:check` is the gate over that same data — the only one of the `api*` commands that can fail.
- `npm run check` is the default non-fixing quality sweep for agents and contributors. It runs `packages:check`, `typecheck`, `lint`, `format:check`, `order:check`, `exports:check`, `reachability:check`, `type-home:check`, `portable:check`, `mocks:check`, `backend-prefix:check`, `api:check`, `docs:check`, and `support:check`, among others — `scripts/check.ts` is the list, and this prose is a summary that has already drifted once. `typecheck` covers the SDK, examples, scripts, functional scenes, tools, and root TypeScript configs through environment-specific projects.

  `check` **runs the gate scripts; it never runs their colocated tests.** Every gate above is a `tsx scripts/<name>.ts` invocation, so a change to `scripts/` is _exercised_ by `check` but nothing asserts on it — a broken `scripts/*.test.ts` is invisible to a green `check`. Those tests live in the `shared` and `coverage-gate` vitest projects, so the whole-repo `npm run test` covers them, and `npm run test scripts` scopes to them directly (40 files at time of writing). The trap is not a coverage hole, it is an inference: when the thing you edited _is_ a check, running `check` feels like testing it. It is not. Run `npm run test scripts` after changing anything under `scripts/`.

  **Two test populations sit outside every per-package selector, and both are invisible exactly to the people who would benefit from knowing.** `scripts/*.test.ts` is the first; `conformance/` is the second, and it is its own vitest project reached by no `npm run check` and no `npm run test <package>`. A format-importer change can therefore be reported green in complete good faith while an entire conformance project is red — this is not hypothetical, it cost a round trip on the MD5 tangent work. **Run `npm run test conformance` before handing off a change to any `*-formats` importer**, the same way `scripts/` changes run `npm run test scripts`. Neither selector is expensive; what is expensive is the whole-repo run they let you avoid.
- `npm run packages:check` checks monorepo shape, package references, workspace dependency conventions, package export targets, packaging shape, and side-effect-free source invariants.
- `npm run docs:check` gates the agent documentation: every doc with a self-declared size budget (currently AGENTS.md at 40,000 characters, warning within 2% so the pressure arrives while one section can still absorb the cut), every per-package cell against [packages/CONTRACT.md](packages/CONTRACT.md), and every relative link under `agents/`. Budgets are measured in characters, not bytes. Failures are unambiguous violations; warnings are drift needing a human ruling (a missing charter `North star`, a provenance outside the contract vocabulary, an AGENTS.md pointer entry carrying progress vocabulary rather than leaving status to the linked doc's own header) and never gate. Add `-- --verbose` to list warnings individually.
- `npm run exports:check` checks for missing test files and missing tests for exported functions.
- `npm run reachability:check` derives backend capability from matching built-in runner/per-kind `register*` declarations, hard-gates that the sets are exact inverses and that each wrapper fronts its named runner, inventories every exported registrar, then reports `.`/`./contract` runtime-value lane drift without failing. A readable ownership row records the called registration door, string kind (literal or uniquely resolved exported constant), and implementation identifier for either the two-argument or state-plus-pair door form. Registrars whose kind comes from their caller are reported separately as direct or batch `mechanism` rows; they are the registry mechanism, not ownership misses. Every remaining unreadable registrar is named `UNCATALOGUED`, never omitted. Its syntax buckets distinguish implementation call results from inline arrows/objects and caller-independent hidden loops/arrays from mechanisms; `not-kind-registration` rows are excluded from the recorder-miss denominator. `npm run reachability:json` exposes the complete `registrarOwnership` rows. Lane placement is a curated tuning decision, not a source-derived invariant. After reviewing an intentional move, run `npm run reachability:baseline` to accept the new baseline.
- `npm run order` reports import statements, exported functions, and test `describe` blocks that are not in canonical order. Imports are grouped (`node:` builtins, packages, other, then relative) with a blank line between groups and sorted within each group; exported functions and `describe` blocks are alphabetized in `packages/*/src`. `npm run order:check` runs the same check in failing mode once a package or area has been cleaned up. `npm run order:fix` rewrites files in place to apply the correct order; comments immediately preceding a declaration (with no blank line between them) are treated as attached and move with it.
- `npm run test` runs the normal root Vitest workspace, excluding the heavier `size` project. This is usually faster than chaining individual package test scripts separately. `npm run test conformance` selects the dedicated `conformance/` project; a zero-file or zero-test selection fails rather than reporting an empty pass.
- `npm run test:unit` runs each package under its OWN vitest config instead, so every package gets its declared environment (`node` or `jsdom`) rather than the root run's shared jsdom, and `tool-capture`'s serialized browser contracts are included. That fidelity costs a separate Vitest startup per package, so it is minutes rather than seconds and CI splits it four ways: `-- --shard=2/4` runs one weight-balanced slice, and `-- --shard=2/4 --list` prints that slice's packages without running them. A shard that selects no package fails rather than reporting an empty success.
- `npm run size` builds matching examples and reports gzip output size against the baseline. It supports filtered runs, JSON reporting, and output file paths.
- `npm run dev:functional` launches the functional test tool in `tools/functional`, a browser dev server that runs each functional test across its renderers (Canvas/DOM/WebGL) for visual and behavioral checks you cannot get from jsdom unit tests. (`dev:examples` and `dev:gallery` are the equivalent live servers for the other tools.)
- `npm run test:functional` is the headless render gate for those same tests, returning pass/fail. It is an umbrella over three checks, each runnable on its own: `test:functional:smoke` (builds, runs, no error, not blank), `test:functional:parity` (the raster backends agree with each other — consistency), and `test:functional:regression` (each backend matches its committed fingerprint baseline — `:regression:baseline` rewrites them). `test:examples:*` mirrors all of this for examples. The per-check collapse aliases `test:smoke` / `test:parity` / `test:regression` run that one check across both subjects. Smoke and parity are environment-independent (CI gates every PR); regression is coupled to where its baselines were captured.
- `npm run capture:check` is the visual regression gate: captures every tool, compares each screenshot against its committed baseline, and exits 1 if any has changed. Run after committing baselines. `capture:examples:check` and `capture:functional:check` run each tool independently.


## Checkpoints in detail

Run these at the points listed. Each check is fast; skipping them causes cascading failures that are slower to debug than the check itself.

- Run `npm run packages:check` after package-level changes: manifests, workspace references, exports, build targets, or side-effect behavior. Fix everything it reports before moving on — it catches stale subpaths, missing `tsconfig.json` references, workspace dependency mismatches, packaging drift, and top-level side-effect statements.
- Run `npm run exports:check` after adding, removing, or renaming exported functions to confirm every export has a colocated test.
- Run `npm run reachability:check` after changing an effect runner/registrar or backend leaf renderer. A per-kind register function is a capability claim, so it must front a real implementation; a passthrough is not a capability and must not ship a fake runner or wrapper. Review the separately reported lane drift, then run `npm run reachability:baseline` only when the curated placement change is intentional.
- Run `npm run portable:check` (part of `npm run check`) after adding source — it gates the C++-lowerable subset the port depends on, failing on non-lowerable dynamic escapes (`eval`/`new Function`/`new Proxy`/`Reflect.*`/`with`/`*.prototype` assignment/`structuredClone`). Closures, `async`, generics, `Map`/`Set`, and classes are fine (they lower to C++/Rust/Haxe) and are not gated. A genuinely-intentional, contained escape goes in the script's `ALLOW` with a reason. See [portability](portability.md).
- Run `npm run order` after adding, removing, or renaming exported functions or test `describe` blocks, or after changing imports. Use `npm run order:fix` to rewrite order automatically. Import sorting lives here (not in the linter): `order` groups and sorts imports across all source, and alphabetizes exported functions and `describe` blocks in `packages/*/src`.
- Run `npm run api:check` after public API changes. It enforces the API policy — duplicate exported names and accessor-prefix contracts — and exits non-zero on a violation. Plain `npm run api` is a listing command: it prints signatures, exits 0 whatever it finds, and enforces nothing, so an absence of complaints from it is not a pass.
- Run `npm run size` after changes to examples, package exports, barrel files, renderer registration, dependencies, or anything that may affect tree-shaking.
- Run `npm run support` after changing functional scenes or adding, removing, or re-capturing functional baselines. It regenerates the backend support matrix ([support-matrix](support-matrix.md) + `.json`) from two independent facts: current scene targets declare realization, while `functional/baselines/` records deterministic capture. A tick requires both. A fingerprint without a realized target remains visible as a captured control (`⊘`), never support; the exceptional fixture that deliberately renders an unsupported control exports `functionalBackendSupport = 'control'` beside the scene. `support:check` (in `npm run check`) fails if the committed matrix is stale, so it can't drift. All four backends re-verify in-sandbox — WebGPU via Playwright's SwiftShader software Vulkan adapter (`npm run capture:functional`/`test:functional` drive it) — though a small set of WebGPU scenes exceed the fingerprint tolerance on software-vs-hardware antialiasing; see [maturity-gaps](maturity-gaps.md).
- Run the closest meaningful tests while iterating: a touched test file, a package workspace, or a Vitest project filter. Broaden once the local behavior is understood.
- While iterating, verify every affected package with `npm run check <package>` and `npm run test <package>` (both take a name/path/@scoped selector and scope to it). Re-run those checks on the final tree before handoff when later edits could have affected their result. `check` is the static/type/structural sweep (it runs `typecheck` among the rest); `test` is the unit tests — package-scoped work normally needs both.

  Add the bare whole-repo `npm run check` when a change crosses package boundaries or affects shared contracts, manifests, exports, build structure, or repository-wide tooling. Add the bare whole-repo `npm run test` only when behavior is broadly cross-cutting or the task explicitly requires it. Integration/CI owns the single full-suite run for the combined tree, avoiding a duplicate full test run for every isolated commit. The full render matrix (all scenes × backends: `test:browser`, `capture:check`, the nightly/release jobs) is likewise CI's job, not a per-clone one. When your change touches rendering, run the render gate relevant to it, scoped to the affected scene: `test:functional:smoke`/`:parity` are environment-independent and yours to run; `test:functional:regression` is only valid where its baselines were captured.
- When adding a new package, copy the package shape from a nearby package, then run `npm run packages:check`. A package may spawn focused neighbor packages using a `-subpackage` suffix (for example `@flighthq/spritesheet-formats` alongside `@flighthq/spritesheet`) when the scope is clearly bounded and the split keeps both packages tree-shakable.
