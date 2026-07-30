---
package: '@flighthq/scene2d-resources'
draft: false
lastDirection: 2026-07-25
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# scene2d-resources — Charter (reserved home)

## What it is

`@flighthq/scene2d-resources` is the **2D twin of `@flighthq/scene3d-resources`**. It owns the
renderer-neutral `Scene2DDocument` boundary and the synchronous-parse → reconcile → async-load
pipeline over it — and, on top of that pipeline, the **named-slot content-resolution seam** that makes
importing a *named 2D node graph* (the "placeholders in space, filled by code" workflow) a first-class
capability rather than an ad-hoc convention.

Where `scene2d-formats` **produces** a `Scene2DDocument` from an authoring artifact (SVG, Lottie, Rive,
SWF), this cell **resolves** one: it acquires URLs, dispatches to the format parsers, reconciles a
working set of references, and hands slots to the application to fill. It is the exact mirror of how
`scene3d-resources` sits above `scene3d-formats`.

## The three import contracts (why this cell exists)

A visual-authoring artifact can be imported under three genuinely different contracts, and they want
different guarantees:

1. **Flat graphic** — reproduce the picture. Guarantee: *visual* fidelity. Output: a realized
   display subtree, straight to `Node2D` nodes. Owned by `scene2d-formats` today.
2. **Animation** — reproduce timed motion. Guarantee: *temporal* fidelity. Output: display subtree +
   `@flighthq/animation` clips bound through the display-object animation target. Owned by
   `scene2d-formats` today.
3. **Named node graph** — a spatial layout of **named placeholders** whose contents code swaps at
   runtime. Guarantee: *structural-contract* fidelity — names, transforms, slot extents, and type
   linkage. The visual inside a slot is provisional (a mockup the code replaces), so pixel fidelity of
   slot interiors is nearly irrelevant. **This is the contract this cell adds.**

Contracts #1 and #2 realize immediately (the `scene2d-formats` North star: straight to nodes, no
duplicate normalized document — the `LottieDocument` decision). Contract #3 is the opposite: its
product is a **manifest of holes**, so it must *defer* realization behind an enumerable document. That
is `Scene2DDocument`.

## The invariant #3 preserves

Every workflow that historically *landed* named-graph authoring — Flash instance-name + linkage, XAML
`x:Name` + code-behind, Godot scene + script, Unity prefab + script — obeys one rule:

> **Bind by name; generate neither artifact from the other.**

Visual (names + layout) and code (behavior + content) are independently authored and versioned,
coupled only through a shared name namespace. `code-as-UI` (React/Flutter) breaks it — the document
*is* the code. `visual-as-code` (design-tool codegen) breaks it — the code is a lossy derivative of the
visual. This cell's job is to enforce that invariant by construction: the imported document exposes
only **names**; code fills them and never reaches into the imported tree.

## `Scene2DDocument` — the boundary type

A renderer-neutral 2D display document with **deferred named references**, the twin of
`Scene3DDocument`. Members:

- **Structure** — the `Node2D` hierarchy (containers, shapes, bitmaps, text) with transforms and
  authored bounds, realized on resolve.
- **Content references** — named holes the document *wants filled*, of two kinds:
  - **Asset references** — `bg.png`, resolved by the loader (the generalization of today's
    `resolveImageResource` seam, already present for SVG `<image>`/Lottie images).
  - **Slot references** — `avatarSlot`, resolved by **the application**: `resolveSlotContent(name) →
    Node2D`. Same seam shape (`name → thing`), different filler — assets pull from the loader, slots
    pull from code. "Image goes here" and "my dynamic content goes here" become one mechanism.
- The reference set is **enumerable**, not only a pull-callback. Code can ask "what does this document
  want?" before resolving any of it — the enumerable manifest *is* the slot contract, exactly as
  `Scene3DDocument` lists its resources rather than only pulling them.

## The three-layer pipeline (mirrors `scene3d-resources`)

- `loadScene2DDocumentFrom*Url` — URL acquisition + synchronous parse → `Scene2DDocument`.
- `resolveScene2DResources` — reconcile a working set synchronously (assets via loader, slots via the
  app's `resolveSlotContent`).
- `loadScene2DResources` — the operation-scoped Promise/progress boundary for async fills.

Same shape as `loadScene3DDocumentFrom*Url` → `resolveScene3DResources` →
`loadScene3DResources`/`updateScene3DResourceStreaming`. #3 is not a new mechanism — it is **porting the
shipped `SceneDocument` + `scene3d-resources` model to the 2D side**, generalized from "resolve named
*resource* references" to "resolve named *content* references."

## Per-package deltas

- **`@flighthq/types`** — `Scene2DDocument`, its content-reference records, and the slot/linkage types.
- **`@flighthq/node`** — existing hierarchy add/remove primitives install reference-owned content; no
  new node or scene2d runtime state is required.
- **`scene2d-formats`** — a **named-graph output mode**: shared parse front-end, then emit a
  `Scene2DDocument` with slots instead of a realized tree (see its charter's #3 decision).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-25] Chartered as the 2D twin of `scene3d-resources`.** Owns `Scene2DDocument` + the
  parse/reconcile/load pipeline + the named-slot content-resolution seam. Not built; bless-to-build is
  the user's. User-directed 2026-07-25 (design session: "give the 2D side the `SceneDocument` /
  `scene3d-resources` model the 3D side already has").
- **[2026-07-25] Manifest over embedded slots.** #3 emits an enumerable name→reference manifest that
  code fills, **not** empty containers the code mutates in place. The manifest is the purer
  visual-stays-visual / code-stays-code separation (code touches only names) and matches the
  `Scene3DDocument` template. Resolved the design fork in favor of the manifest.
- **[2026-07-25] Slot resolver is code-driven; asset resolver is loader-driven.** One seam shape, two
  fillers. Slots are `resolveSlotContent(name) → Node2D` supplied by the app; assets keep the existing
  loader/`resolveImageResource` path.
- **[2026-07-25] No live document runtime.** `Scene2DDocument` is static plain data (like
  `Scene3DDocument`), never a live DOM/SWF/Rive runtime. It defers *realization*, it does not host a
  foreign engine.
- **[2026-07-25] Format dispatch is optional, and an open registry if present.** This cell's job is the
  `Scene2DDocument` boundary + resolve/load + named-slot seam. Auto-detecting *which* importer to run
  (sniff bytes → codec) is **not required** — the default is explicit per-importer calls
  (`createScene2DFromSvg`, `createScene2DFromSwf`, …). If a unified auto-detect entry is wanted, it is an
  **open registry, never a closed switch/enum**: `registerScene2DImporter(magic, importer)` +
  a `createScene2DFromDocument(bytes)` dispatcher, where each codec (`scene2d-formats`, `@flighthq/swf`,
  …) registers *in*. The dispatcher depends on no codec, unused codecs tree-shake, users add their own
  format the same way — dependency points **codec → registry**, exactly like `image-codec`'s
  MIME→decoder table and `registerRenderer`'s kind→renderer table.
- **[2026-07-29] Built with a strictly synchronous reconcile stage.** `resolveScene2DResources`
  consumes only caller-ready `Node2D` content and never starts I/O or schedules a Promise.
  `loadScene2DResources` is the sole operation-scoped asynchronous boundary. This intentionally follows
  the documented three-stage architecture. The 3D twin subsequently preserved its progressive behavior
  under `updateScene3DResourceStreaming` and made its resolve stage synchronous too.
- **[2026-07-29] Import dispatch is explicit registry state.** A
  `Scene2DDocumentImporterRegistry` starts empty; SVG and Lottie register through separately imported
  functions, and custom/Rive/SWF codecs use the same last-write-wins kind registry. No codec registers at
  module load and URL acquisition requires a caller-supplied fetch seam.
- **[2026-07-29] Installed content belongs to the manifest reference, not `Node2DRuntime`.** Each
  `Scene2DContentReference` explicitly retains its current content so repeated resolve passes can replace
  only the child they installed. Slot linkage likewise remains reference metadata. This keeps resource
  state off every 2D node and avoids a hidden resources-layer map.

## Open directions

1. ~~**Cross-package sequencing**~~ — **resolved 2026-07-29:** resource bindings and linkage are
   explicit manifest-reference state; no `node`/`scene2d` runtime primitive is required.
2. **Slot typing/validation** — how strictly a slot's linkage type is checked against the `Node2D` code
   supplies (structural vs nominal), and the diagnostic when a document names a slot code never fills.
3. ~~**Non-unique names**~~ — **resolved 2026-07-29:** importers retain direct target references in the
   manifest, so runtime name traversal is not part of binding.
4. ~~**Source coverage**~~ — **ruled 2026-07-30 (user):** SWF is next. Rive is recorded as the second
   source — a revisit candidate, since its MIT-licensed reference runtime means a permissive oracle
   exists for it (unlike Spine's non-permissive one). SVG-deepening is declined for now: `scene2d-formats`
   already carries SVG documents, so the marginal value of a second SVG path here is lowest of the three.
