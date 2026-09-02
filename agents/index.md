# The `agents/` Library

The codebase map is **[`AGENTS.md`](../AGENTS.md)** at the repository root — read that first; it is the
one file every agent reads in full. This file indexes **everything else**: architecture records with
domain-entry triggers ("before touching X, read Y"), reference docs, plans, reviews, and work in flight.

**Before changing a subsystem's shape, scan the [architecture records](#architecture-records) below.**
Each entry names the moment to open it. `AGENTS.md` carries only rules an agent could violate _without
knowing the domain existed_; domain-specific triggers live here.

**Status lives in the doc, not in the index.** Each document below states its own status in its own
header, where the reader who opens it will see it. Do not copy that status into this file or into
`AGENTS.md` — a second copy goes stale silently and is then trusted.

## Reached from a rule in the map

These are linked at the point of the rule they serve, which is the placement that matters. Listed here
only so the library is complete.

**Conventions** (`agents/conventions/`) — [commits](conventions/commits.md),
[diagnostics](conventions/diagnostics.md), [export lanes](conventions/export-lanes.md),
[file naming & type home](conventions/file-naming.md), [invalidation](conventions/invalidation.md),
[naming](conventions/naming.md), [npm scripts](conventions/npm-scripts.md),
[testing](conventions/testing.md), [types layout & kind identity](conventions/types-layout.md),
[validation](conventions/validation.md).

**Rule references** — [anti-goals](anti-goals.md), [bundle size](bundle-size.md),
[commands](commands.md), [feature lookup](feature-lookup.md),
[functional cell rules](../functional/README.md), [packaging](packaging.md),
[portability substrate](portability.md), [registration model](registration-model.md).

**Package knowledge** — [package cells](packages/index.md) (the per-package
charter / review / assessment / status architecture), [catalog](packages/catalog.md),
[map](packages/map.md), [register](packages/register.md),
[structural forks](packages/structural-forks.md).

**Focused package evidence** — [scene2d-dom CSS-filter public-lane audit](packages/scene2d-dom/public-lane-audit.md).

## Architecture records

The design behind a subsystem, read before changing its shape. Each entry names its trigger — "before
touching X" — so you know when to read it. An entry marked **unratified** is a proposal: read it before
working in that area, but do not build on it as settled. New architecture records go here, not in
`AGENTS.md`.

- [3D materials & lighting](3d-materials-architecture.md) — the canonical 3D material and light model.
- [3D pipeline](3d-pipeline-architecture.md) — the 3D draw pipeline end to end.
- [AudioDeviceBackend design](audio-device-backend-design.md) — **proposal.** an installable native audio-device seam using opaque handles and process-global installation.
- [backend lifecycle ownership](backend-lifecycle-ownership.md) — the reconciled backend ownership
  partition, exact entity/key cleanup brackets, and provider-provenance work still owed.
- [blend / composite](blend-composite-architecture.md) — blend modes and compositing across backends.
- [Canvas CSS-filter / luminance sweep](canvas-css-filter-luminance-sweep.md) — the exhaustive nine-effect
  filter population, its one luminance intersection, and the mixed-channel reproduction that distinguishes it.
- [capture verification tiers](capture-verification-tiers.md) — what each capture leg checks, and what fails hard.
- [collision support registry](collision-support-registry.md) — **ratified 2026-08-20.** replacing the O(N²) pair matrix with a support-function core; where genericity stops, and how the 2D/3D boundary is carried when there is no graph to enforce it.
- [dom screenshot / fingerprint divergence](dom-screenshot-fingerprint-divergence.md) — DOM captures produce two different artifacts for the regression gate and human review; the gate is blind to screenshot-only defects.
- [document audio resources](document-audio-resources.md) — a document carries audio bytes on the image lane's terms, never playback.
- [draw order model](draw-order-model.md) — before adding an ordering field to a node or a child-reordering pass. Child order is the only order; the caller-owned `NodeOrderList`.
- [bounded expected-image descriptions](functional-bounded-descriptions.md) — functional scenes whose expected picture is genuinely undecided, and therefore cannot be commissioned as a permanent reference.
- [effect / adjustment / material](effect-adjustment-architecture.md) — before adding an image operation or touching the adjustments/effects boundary. The three-tier Material / Adjustment / Effect model.
- [effect-pass UV origin](effect-uv-origin-architecture.md) — the GL/WGPU positional-UV sweep and the proposed sampler-local normalization seam.
- [host-web architecture](host-web-architecture.md) — before touching `webHost`, `web*Backend` consts, or the capability/host boundary. The domain census, extraction plan, and types spine.
- [host-web document-absence outcomes](host-web-no-dom-outcomes.md) — the post-Accessibility R17 census of nine provider operations whose no-DOM outcome remains silent.
- [upstream host requirements](upstream-host-requirements.md) — before extracting host backends, changing backend lifecycle or operation availability, or adding a native host package.
- [loader progress currencies](loader-progress-currencies.md) — **unratified.** Before touching `onProgress`, `getResourceLoadProgress`, `weight`, or `bytesHint`. Item count vs weighted fraction vs bytes.
- [material modifier model](material-modifier-model.md) — before touching how node color relates to materials or adding a color-remap op. Color adjustment is a material _feature_, not a shading family.
- [physics3d solver abstraction](physics3d-solver-abstraction.md) — **ratified 2026-08-20.** sequential impulses first; the four data-model obligations that keep XPBD possible, and why a `SolverBackend` interface is not one of them.
- [parity skip declaration model](parity-skip-declaration-model.md) — **unratified.** what a parity skip must record, and the reference-to-all-pairs demotion it hides.
- [effect recipe model](effect-recipe-model.md) — **unratified.** who turns an effect intent into passes; the `strength` definition.
- [morph-target animation](morph-target-animation.md) — the blend-shape deformer and the GPU path.
- [read integrity](read-integrity.md) — the axes a format reader must hold.
- [render architecture](render-architecture.md) — the render and scene architecture in full.
- [render backend support](render-backend-support.md) — before assuming a feature works on a backend, or scoping a functional test's `renderers`. The narrative behind the generated [support matrix](support-matrix.md).
- [render oracle calibration record](render-reference-image-calibration-record.md) — the committed cross-host calibration result that rules §10 contingently, and which of its fields are measured rather than inferred.
- [reference-image rename](reference-image-rename.md) — **ratified, ready to dispatch.** retiring "oracle" as an unqualified term: the three-bucket partition, the exclusion list, and why a blanket rename corrupts the largest population.
- [render oracle repository](render-reference-image-repository.md) — **proposal.** blessed reference images for a full-resolution regression tier, and the measured reason they are not stored in git.
- [render view model](render-view-model.md) — **unratified.** Before touching `ApplicationRenderView`, `application-gl`, or the `render` sub-target. Extracting a windowless `RenderView`.
- [runtime package review](runtime-package-review.md) — why the runtime facade and substrate packages were considered and declined, and why ambient language facilities remain distinct from host code.
- [server-side architecture](server-side-architecture.md) — **proposal.** the layered package plan that completes Flight's server story: `host-node` → `tool-pipeline` → `serialize` → `sync` + `authority` → `render-cpu`. Builds on [cloud & distributed breadth](breadth-cloud-distributed.md).
- [registration lifecycle](registration-lifecycle.md) — **unratified.** how a file's contents become the exact `register*` calls that draw it: requirement sets, the source-derived catalog, and the generated registries module.
- [registry table model](registry-table-model.md) — **unratified.** the storage under the registration doors: three table shapes, and which tier owns a registry.
- [ribbon trails](ribbon-trail-proposal.md) — **proposal.** a trail recorder and a strip builder, and why the 3D draw needs nothing new.
- [command history model](command-history-model.md) — **unratified.** undo/redo for editors, and the ruling that commands are kind-tagged data rather than closure-carrying objects.
- [gizmo architecture](gizmo-architecture.md) — **unratified.** transform handles in an overlay scene, and the declared exception to the controller-only pattern.
- [gui controller architecture](gui-architecture.md) — **unratified.** the controller-only widget layer: the caller owns every visual, the library owns behavior.
- [scene document model](scene-document-model.md) — **unratified.** Flight's native `.flight` scene description: the multi-scene container, three encodings over one document model, and the manager rulings preserved after a records collision.
- [selection model](selection-model.md) — **unratified.** pure selection state over graph nodes, typed on graph-feature aliases rather than one graph family.
- [scene2d format coverage](scene2d-format-coverage.md) — what the Lottie and SVG importers read and what they do not.
- [scene3d format coverage](scene3d-format-coverage.md) — what each 3D importer reads and what it does not, per format.
- [skeleton2d animation model](skeleton2d-animation-model.md) — non-bone timelines, target-kind dispatch, and where constraints live.
- [spatial dimension seams](spatial-dimension-seams.md) — **ratified 2026-08-20.** two dimension-native seams over one shared policy layer; why the 2026-07-15 "same seam" wording describes something that does not exist.
- [swf JPEG alpha import](swf-jpeg-alpha-import-proposal.md) — the measured boundary for rejoining encoded colour and a separate alpha plane without choosing bitmap routing.
- [swf video import](swf-video-import-proposal.md) — **proposal.** what a DefineVideoStream import may honestly claim at each stage.
- [timeline source model](timeline-source-model.md) — dictionary vs sequence, and where playback vocabulary lives.
- [texture color space](texture-color-space-model.md) — **unratified.** the decode landed, the encode did not.
- [timeline cue model](timeline-cue-model.md) — before adding anything that fires on frame entry or giving an importer a `FrameScript`. Authored cues are plain kind-dispatched data; importers emit zero closures.
- [texture source model](texture-source-model.md) — before touching `Texture`, `TextureSource`, `ImageBacking`, or `TextureAtlas` internals. The flat `Texture`-over-`TextureSource` model.
- [texture / surface / resource](texture-surface-resource.md) — the boundary between the three.
- [version-keyed import model](version-keyed-import-model.md) — compatibility-field gates vs probe+registry for version-dependent wire layouts.
- [basis transcode](basis-transcode.md) — Basis-Universal texture transcode.
- [wgpu 3D parity spec](wgpu-3d-parity-spec.md) — each item cites the GL file it mirrors.

## Plans, reviews, and direction

Material for a direction-setting or planning role. A builder scoped to one package does not need these,
which is why they are not in the map.

- [three approved shapes](three-shapes-scope.md) — the approved scope for interaction dispatch
  layers, the effect capture geometry helper, and the immediate-mode GPU draw seam.
- [openfl-flight upstream batch](openfl-flight-upstream-batch.md) — the approved batch of ten
  general-purpose Flight improvements surfaced by the openfl-flight gap analysis, each
  independently dispatchable. Not OpenFL-specific adapters.
- [examples plan](examples-plan.md) — the planned example set and implementation order.
- [quality plan](quality-plan.md) — API maturity verification, unit vs functional test guidance.
- [input ingress seam](input-ingress-seam-plan.md) — **implemented.** the exhaustive 26-site DOM
  listener population, approved process-global backend shape, zero-budget rationale, and acceptance
  evidence.
- [structurally unable expected-image worklist](functional-structurally-unable-worklist.md) — the
  measured 243-cell CC-2 assignment sheet, including constructor seams and direct-registration tails.
- [maturity gaps](maturity-gaps.md) — production-readiness gaps across the SDK.
- [causal limitation prose audit](causal-limitation-prose-audit.md) — classified repair-sensitive backend claims and the assertions that keep successful fixes from staling them silently.
- [god-rays parity investigation](god-rays-parity-investigation.md) — the UV-origin root cause behind the Gl/Wgpu god-rays split, with the four hypotheses that were tested and refuted first.
- [port readiness](port-readiness.md) — the roadmap toward the C/C++ port (draft).
- [review work items](review-work-items.md) — outstanding items raised by review passes.
- [sdk blocking issues](sdk-blocking-issues.md) — what blocks AwayJS example parity.
- [test escape modes](test-escape-modes.md) — seven measured ways a real defect survives a green suite,
  each with its detection question, and what `untested` / `unchecked` can and cannot see. Read before
  writing tests for a residue, not only when auditing one.
- [test depth review](test-depth-review.md) — the unit-test-depth review and its gap list.
- [gate audit results](gate-audit-results.md) — fresh mutation specimens and observed failure output for
  all 29 non-advisory whole-repository gates.
- [functional assertion census](functional-assertion-census.md) — generated location-sensitivity
  classification for every functional scene source, with current-tree known-answer controls.
- [inert gate audit](inert-gate-audit.md) — gates that pass without checking anything.
- [log sink cleanup audit](log-sink-cleanup-audit.md) — tracked-code census of `addLogSink`
  registrations, their cleanup lifetimes, and the one unresolved debug rollback ambiguity.
- [boundary-only checks](boundary-only-checks.md) — its mirror: checks that verify exactly what they
  claim and that CI cannot run, because each one's subject is a parcel and a parcel is not in the tree.
  An index, not a gate — it cannot make them run, only make their disappearance visible.
- [unbacked register](unbacked-register.md) — claims that reached the merged tree with nothing looking
  at them. Entries owned by integration; the file carries its own limit, because it can only hold what
  someone noticed.
- [wgpu backlog](wgpu-backlog.md) — confirmed WebGPU defects and coverage surface, accumulated while
  WGPU work is deferred behind other work. Deferral is scheduling, not severity: read the per-entry
  severity, not the file's position in this list.
- [WGPU 2D supersample blocker](wgpu-2d-supersample-blocker.md) — deterministic failure census and
  source-level diagnosis for the physical-target versus logical-viewport regression.
- [depth review: codec formats](depth-codec-formats.md) — the codec-format cluster in depth.
- [swf video import decision](swf-video-import-proposal.md) — Stage A is ratified and implemented as
  structural import through a sourceless `Sprite`; payload preservation and decode remain unratified.
- [breadth synthesis](breadth-synthesis.md) — convergences across the four breadth reviews:
  [adjacent content](breadth-adjacent-content.md), [platform variance](breadth-platform-variance.md),
  [cloud & distributed](breadth-cloud-distributed.md), [domain deepening](breadth-domain-deepening.md).

## Generated views — do not edit, and do not commit what is ignored

- [support matrix](support-matrix.md) — realized, captured-control, and unbaselined backend cells,
  generated from functional scene discovery plus committed fingerprints by `npm run support`. Gated by
  `support:check`.
- `packages/TODO.md` — the work index, weakest first. **Gitignored**: run
  `node agents/packages/todo.mjs` to write it, then read only the named cell. It is a pure view over the
  cells, so generate it rather than merging it.
