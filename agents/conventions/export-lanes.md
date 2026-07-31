# Package Export Lanes — public / contract / private

Read before adding a package export, wiring one package to another, or reasoning about
what belongs in the `@flighthq/sdk` barrel. This supersedes the older "single root `.`
entry, no subpath exports" ground rule (AGENTS.md) — that rule banned _file-mirroring_
subpaths for bundle reasons; it did not anticipate segmenting a package's surface by
audience, which is what this convention adds.

## The problem this solves

Today every package exposes exactly one barrel, `export *`'d wholesale into the
`@flighthq/sdk` convenience barrel. That conflates two distinct questions:

- **What may another SDK package consume from this one?** (the full working surface)
- **What may an end-user app consume?** (a cultivated, decision-only surface)

Because they are the same set, internal plumbing leaks to users. `@flighthq/render`
exports ~55 functions; only a handful (`registerRenderer`, `createRenderState`,
`prepareScene2DRender`, …) are user decisions. The rest — `createRenderProxy`,
`getRenderStateRuntime`, `updateRenderProxyMaterial`, `buildRenderQueue`, `walkNode`,
`packRenderSortKey` — are contracts between the user-facing entry point and the backends
(`scene2d-gl/wgpu/canvas/dom`, `scene3d-gl/wgpu`). All of them currently sit in the
top-level SDK namespace, competing for the globally-unique-name rule and cluttering the
public header. `RenderProxy` is the archetype: it appears in **zero** public signatures
and exists only behind the prepare/render barrier, yet it is fully public.

## Three lanes, two audiences

Every package has three lanes of traffic:

| Lane | Entry | Audience | Contents |
| --- | --- | --- | --- |
| **public** | `@flighthq/x` (`.`) | end-user apps + the `@flighthq/sdk` barrel + the port | cultivated subset — the decisions a user makes |
| **contract** | `@flighthq/x/contract` | other `@flighthq/*` packages (intra-SDK) + the port | the **full** exported surface |
| **private** | not exported | the package itself | scratch, pools, local types |

`contract` is the complete surface a sibling may use. `public` (`index`) is a cultivated
subset **designed explicitly for end-to-end user consumption**. `contract ⊇ public`
conceptually; they are two _roles_ that, for a fully-public package like `geometry`,
happen to coincide (everything is promoted) — the lane is still meaningful, and
pre-positioning it means a package never has to _grow_ a contract lane later, it just
stops naming something in `index`.

## The load-bearing invariant

For "contract = full intra-SDK surface, public = app boundary" to hold, one rule is
load-bearing:

> **Intra-SDK imports always resolve to `@flighthq/x/contract`. `.` (index) is the app
> boundary only.**

So `scene2d` importing `createMatrix` reaches into `@flighthq/geometry/contract` — even
though `createMatrix` is public — because the _sibling is an intra-SDK consumer_ and
`contract` is a superset, so it is always sufficient. Consequences:

- The intra-SDK dependency graph is built entirely from `/contract` lanes, so **nothing
  about what is public can constrain what siblings may use.** That decoupling is the
  whole point.
- `.` is consumed by exactly two things: end-user apps, and the `@flighthq/sdk` barrel
  (`export * from '@flighthq/geometry'` picks up `index` = the public subset). Leak-proof
  by construction — no per-package exclusion policy needed.
- This is a _simpler_ invariant than "import `.` for public symbols, `/contract` for
  protected": consumers never track which lane a symbol is in, and a symbol moving
  public→protected never breaks a sibling's import.

Intra-_package_ imports are unaffected — a file imports its neighbors by relative path
(`./renderProxy`) as today. Only _cross-package_ specifiers route through `/contract`.

## File topology

The full barrel moves from `index.ts` to `contract.ts`; `index.ts` becomes the cultivated
public subset.

- `contract.ts` — `export *` over every source file (this is what today's `index.ts` is).
- `index.ts` — names the public subset. Mechanically it need **not** re-export from
  `./contract`; re-exporting the cultivated names from their source files
  (`export { prepareScene2DRender } from './renderProxy'`) is equivalent and preserves
  file provenance. The framing is conceptual: `contract` is the full surface, `index` is
  the curated view.
- `package.json`:
  ```jsonc
  "exports": {
    ".":         { "types": "./dist/index.d.ts",    "default": "./dist/index.js" },
    "./contract":{ "types": "./dist/contract.d.ts", "default": "./dist/contract.js" }
  }
  ```

`contract` is the **only** blessed subpath. Any other subpath (a file-mirroring
`@flighthq/x/renderProxy`) stays banned — that is what the original ground rule rightly
prevented, and the check keeps rejecting it. The ban costs nothing to obey: because every
package declares `"sideEffects": false`, a file-mirroring subpath buys no bundle savings a
bare `.` import does not already give, and all it adds is a published API coupled to an
internal file name — so renaming a file becomes a breaking change for no gain. A fully-public package still carries both
files: `contract.ts` = `export *`, `index.ts` = the full promoted list. That is not
ceremony — `index.ts` _is_ the package's public-API manifest (see below).

## Types keep their single home

The "all exported types live in `@flighthq/types`" rule is preserved verbatim — the
`types` package simply gains the same two lanes:

- `@flighthq/types` (`.`) — public types (the app-facing header).
- `@flighthq/types/contract` — contract-only types (`RenderProxy`, `RenderProxyVisitor`,
  `RenderProxy2D`, …).

Contract types are still physically in the `types` package, so the port still maps them
`flighthq.types.*`, collision-free — the load-bearing half of the type-home rule is
untouched. `type-home:check` keeps enforcing "no exported types outside `@flighthq/types`";
it only learns that `types` has two lanes. Contract types drop out of the public header
because `.` no longer names them and `export *` in the SDK barrel skips the subpath.

Hideability is **per-type**, and the test is **audience, not raw signature reachability**:
a type is contract-only when no _app_ needs to name it — only the package itself, a sibling,
or an extension author acting as a backend does. A public type may legitimately reference a
contract type in a method an app never implements. `Renderer` is public (apps register
renderers), yet `Renderer.draw`/`submit` takes `RenderProxy`, which stays contract-only: a
custom renderer's `draw` is backend work, so its author is a contract-tier consumer and names
`RenderProxy` via `@flighthq/types/contract`. The emitted `.d.ts` referencing the contract
lane is correct-by-design, not a leak — `contract` is a real published entry. The bar is that
no _named_ SDK export leaks a contract symbol; transitive references from a public type into
`/contract` are expected. `RenderProxy` passes the audience test cleanly — every
`registerRenderer` call passes a pre-built renderer object; only the runner harness names the
type.

## Where the public subset is highlighted — resolved

The open question was: with `index` not literally re-exporting `contract`, where does a
reader see that a given symbol is public?

**Decision: `index.ts` _is_ the highlight.** It is the one file per package that enumerates
the public API — the function-surface analog of the `@flighthq/types` header for types.
Publicness = presence in `index.ts`. To answer "is `X` public?", read (or grep) `index.ts`.
This is consistent with how the codebase already treats types (one navigable header) and
keeps promotion to public an explicit, reviewable one-line diff — exactly the "every
exported name is worth keeping" discipline the pre-release philosophy asks for.

Curation is interactive: **`npm run api:curate`** opens a terminal UI over every package's
contract surface — scroll, press space to toggle a symbol public/contract (or `a` for a whole
package), `s` to write the touched `index.ts` files. It only edits the allowlists, so the
endorsement record stays the resulting `git diff`. `--list` dumps `pkg public/total` non-interactively.

The hazard of a hand-maintained allowlist is **drift**: a new public function is added but
never named in `index`, so it is silently contract-only and an app cannot see it. Intent
cannot be auto-inferred (contract-only is legitimate and common), so the mitigation is
_visibility_, not a hard gate: `packages:check` (and `npm run api`) reports, per package,
the set of `contract` symbols **not** re-exported by `index`. That turns every omission
into a reviewed line rather than a silent one.

Considered and **deferred**: generating `index` from a local `@public` JSDoc marker at
each export site. That makes publicness local to the declaration and eliminates drift by
construction, and it fits the repo's generated-artifact culture (support matrix, order,
type-home). It is a clean v2 if the reviewed-report proves too loose — but it adds a
generator + committed-output check, and is not required for the lane split to land.

## Enforcement (what the checks must do)

- **`packages:check`** — (1) accept `./contract` as a declared export target; (2) reject
  any subpath other than `.` and `./contract`; (3) enforce the invariant: a file under
  `packages/**/src` importing another `@flighthq/*` must use the `/contract` specifier —
  the sole exception is `packages/sdk/src` (the barrel, which re-exports the `.` public
  lanes); (4) emit the un-promoted-exports report (contract-minus-index, per package).
- **`type-home:check`** — accept contract types in `@flighthq/types/contract`; keep
  rejecting exported types anywhere outside the `types` package.
- **`order` / `api` / `exports:check`** — teach them the two barrels; a function's
  colocated test is unchanged by which barrel names it.

## Rollout staging

The global invariant (siblings import `/contract`) can only be fully enforced once every
package has a contract lane, so land it in two stages:

1. **Pattern (this task):** amend the docs + checks to bless the `contract` lane; convert
   `@flighthq/render` and `@flighthq/types` as the two worked examples — full barrel to
   `contract.ts`, cultivated public `index.ts`, `RenderProxy*` types to `types/contract`;
   repoint the direct consumers of render/types (`render-gl`, `render-wgpu`,
   `scene2d-{canvas,dom,gl,wgpu}`, `scene3d-{gl,wgpu}`) to `@flighthq/render/contract` and
   `@flighthq/types/contract`. Proves the mechanism end-to-end.
2. **Sweep:** codemod all remaining intra-SDK imports to `/contract`, give
   every package the two-lane split, and flip the invariant check from warn to gate.

Status: **both stages landed.** Every package carries the two lanes; all intra-SDK imports
resolve to `/contract`; the invariant is a hard `packages:check` gate. Public indexes are
cultivated for the renderer/effect backends and the scene graph (runtime accessors moved to
contract); genuinely-public leaf packages keep `index = export * from './contract'`.
Remaining cultivation is incremental and non-blocking (the gate does not require it) — the
public surface can be narrowed further per package over time using the audience test.

The effects register-all/category aggregates were retired in `2a7ac8bff`; every realized
backend runner now has a matching per-kind registrar. Source-derived reachability hard-gates
that exact inverse and correct mapping, while dot/contract placement remains a curated,
non-blocking tracked baseline. A self-import guard (a package file importing its own
`@flighthq/<pkg>` barrel) would catch the
class of circular-init bug fixed in `nodeTransform2d` and the test breakages cultivation
exposed; worth adding to `packages:check`.

## Reconciliation

- `@flighthq/bitmap` already ships a `./surfaceFingerprint` file-subpath export — a
  pre-existing exception to the old ground rule. Fold it into this model: either it is a
  genuine second public entry (rare; justify it) or its symbols belong in `bitmap`'s
  `contract`/`index` lanes and the file-subpath is retired. Reconcile during the sweep,
  not the pattern stage.
