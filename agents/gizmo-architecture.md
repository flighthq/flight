# Gizmo Architecture

_2026-08-27. Architecture record — transform gizmos and editor overlays for Flight._

**Status: unratified.** Read before working on `gizmo` or any editor visual manipulation feature.

## What it is

`gizmo` is a new package (`@flighthq/gizmo`) that provides transform gizmos — the visual handles an editor draws over selected nodes to let the user move, rotate, and scale them by direct manipulation. A gizmo reads the selection state (from `selection`), draws overlay handles in a separate scene layer, interprets pointer drags on those handles into transform deltas, and emits the deltas as signals. The caller applies the deltas to nodes and manages undo.

## Design

### Gizmo state

A gizmo state is the central coordination object. It connects to a selection state, manages the active tool mode, and owns the overlay scene where handles are drawn.

```typescript
const gizmo = createGizmoState({
  selection: mySelectionState,       // from @flighthq/selection
  overlayScene: myOverlayScene2D,    // a second Scene2D rendered on top of the document scene
  camera: myCamera2D,               // Camera2D for coordinate conversion
});

// Tool mode
setGizmoMode(gizmo, 'translate');    // 'translate' | 'rotate' | 'scale' | 'none'
getGizmoMode(gizmo): GizmoMode;

// Snapping
setGizmoSnapTranslate(gizmo, 10);   // snap to grid increments (0 = off)
setGizmoSnapRotation(gizmo, 15);    // snap to degree increments (0 = off)
setGizmoSnapScale(gizmo, 0.1);      // snap to scale increments (0 = off)

// Coordinate space
setGizmoSpace(gizmo, 'local');       // 'local' | 'world'
getGizmoSpace(gizmo): GizmoSpace;

// Pivot
setGizmoPivot(gizmo, 'center');      // 'center' | 'origin' | 'custom'
setGizmoCustomPivot(gizmo, x, y);

// Update (call each frame)
updateGizmo(gizmo);

// Signals
getGizmoSignals(gizmo).onTranslate   // Signal<(dx: number, dy: number) => void>
getGizmoSignals(gizmo).onRotate      // Signal<(degrees: number) => void>
getGizmoSignals(gizmo).onScale       // Signal<(sx: number, sy: number) => void>
getGizmoSignals(gizmo).onTransformBegin  // Signal<() => void>  (pointer down on handle)
getGizmoSignals(gizmo).onTransformEnd    // Signal<() => void>  (pointer up — one undo entry)
```

### How gizmos render

Gizmos draw into a **separate overlay Scene2D** that the caller renders on top of the document scene. This separation is critical:

- Gizmo handles are not part of the document — they do not appear in the scene tree, are not serialized, and are not affected by document transforms or effects.
- The overlay scene uses the same Camera2D as the document viewport, so handles track their nodes correctly during pan/zoom.
- Handle sizes remain constant in screen space regardless of zoom — the gizmo updates handle scale inversely proportional to camera zoom.

The gizmo creates its own nodes in the overlay scene (arrows, circles, squares for the handles). These are internal — the caller provides the overlay scene, not the handle visuals. This is a deliberate exception to the gui "controller-only" pattern: gizmo handles have fixed semantics (an arrow means translate-along-axis) and fixed visual conventions (red = X, green = Y, blue = Z), so there is no benefit to making the caller author them.

### Translate gizmo

When `mode` is `'translate'`:

- A center handle (move freely on both axes).
- An X-axis arrow handle (constrain to horizontal).
- A Y-axis arrow handle (constrain to vertical).
- In `'local'` space, axes rotate with the node. In `'world'` space, axes are always screen-aligned.

Pointer drag on a handle emits `onTranslate(dx, dy)` where the delta is in the document's world coordinates. The caller applies it: `node.x += dx; node.y += dy`.

### Rotate gizmo

When `mode` is `'rotate'`:

- A circular handle around the selection bounds.
- Dragging along the circle emits `onRotate(degrees)`.
- With snap enabled, the angle quantizes to the snap increment.
- The rotation pivot is determined by `gizmoPivot`.

### Scale gizmo

When `mode` is `'scale'`:

- Corner handles (scale both axes proportionally).
- Edge handles (scale one axis).
- Dragging emits `onScale(sx, sy)` as a multiplier delta.
- Shift constrains to uniform scale.
- The scale pivot is determined by `gizmoPivot`.

### Multi-selection

When multiple nodes are selected, the gizmo draws around the combined bounding rectangle. Transform deltas apply to all selected nodes. The `onTransformBegin` / `onTransformEnd` bracket lets the caller create a single undo entry for the entire multi-node operation.

### Selection outline

The gizmo state also manages **selection outlines** — the bounding box drawn around selected nodes even when no gizmo tool is active. These are lightweight overlays in the same overlay scene:

```typescript
setGizmoSelectionOutlineEnabled(gizmo, true);
setGizmoSelectionOutlineColor(gizmo, 0x4488ffff);
```

### 3D gizmos

The same architecture extends to 3D with a `createGizmo3DState` variant:

- Translate: three axis arrows + three plane handles.
- Rotate: three axis circles (gimbal).
- Scale: three axis cubes + uniform center cube.
- Draws into an overlay Scene3D with the same Camera3D.
- Emits `onTranslate(dx, dy, dz)`, `onRotate(quaternionDelta)`, `onScale(sx, sy, sz)`.

The 3D gizmo is a future extension — the 2D gizmo ships first, matching the editor's Scene2D focus.

## Dependencies

- `selection` — reads the selected set and active node
- `interaction` — pointer dispatch on gizmo handles
- `scene2d` — overlay scene for handle nodes
- `node` — transforms, bounds
- `geometry` — coordinate conversion, rectangle/circle math
- `shape` — drawing handle geometry (arrows, circles, squares)
- `signals` — transform delta signals
- `math` — angle snap, scale snap
- `types` — all type definitions

Does not depend on: `gui`, `command`, `render` (the caller renders the overlay scene), `scene-document`, `tween`.

## Scope boundaries

**In scope**: translate/rotate/scale gizmos, selection outlines, axis constraints, snapping, coordinate space (local/world), pivot modes, multi-selection bounds, transform delta signals, screen-space-constant handle sizing.

**Out of scope**: applying transforms to nodes (the caller does this in the signal handler), undo/redo (the caller uses `command`), guide/ruler overlays (future extension or separate concern), vertex/path editing handles (a shape-editing gizmo is a future extension), 3D gizmos (future extension, same architecture).

---

# Manager rulings — PRESERVED VERBATIM after a records collision, 2026-08-28

★ **Why this section exists.** A records rewrite built from a base that predated these rulings landed and
dropped every ruling section below. The code still implements them and tests pin several, but the
*reasoning* was lost while the conclusions survived — and the reasoning is the part that stops a future
agent re-deriving a decision that was already withdrawn.

Reproduced **verbatim** rather than re-summarised, because summarising a ruling is exactly how this was
lost the first time. Where a ruling is already pinned by a test, the test is the enforcement and this is
the explanation. Where anything here conflicts with the sections above, the *conclusions* above are
current wherever the user has since ruled; this is what those conclusions were built on.

## Manager rulings — 2026-08-27

**Deliverable ruled by the user: THE PACKAGES ONLY.** `gui`, `selection`, `gizmo` and `command` are built
as SDK cells to AAA completeness, each usable standalone by anyone building an editor or tool. **No
editor application ships from this work.** The "editor data flow" in the handoff is motivation, not a
deliverable — do not let an app shell, panel layout, project model, or file management appear in any of
these packages. An editor is a possible follow-on the user will scope separately.

**Sequencing ruled by the user: PARALLEL with `scene-document`.** `selection` and `command` depend only
on `node`, `signals`, `geometry` and `types` and touch nothing `scene-document` touches, so they start
immediately. `gui` needs `interaction`, which exists. Only `gizmo` has real coupling, through the
overlay scene.

**Z1. APPROVED, including the declared exception to the controller-only pattern.** `gizmo` creating its
own handle nodes contradicts `gui`'s premise, and the record says so out loud and gives its reason
(fixed semantics, fixed conventions). That is what a record is for. Approved as argued.

★ **Record the consequence so it is not rediscovered later as a defect: gizmo handles are NOT
skinnable.** An application that wants themed handles cannot get them through this API. That is an
accepted cost today, not an oversight, and if it ever needs to change it is a new decision.

**Z2. The angle convention is right** — `onRotate` emitting degrees matches the authoring layer. Keep
radians out of every signal in this package.

