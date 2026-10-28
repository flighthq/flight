# flight-node

The node-owned half of the scene graph, following approved D16: a node is a raw struct you read
and write directly, then invalidate explicitly.

- `NodeFields` carries `enabled`, the open `kind`, the optional `name`, the entity runtime slot and
  the private base `NodeRuntime` tier (revision counters, children, parent, signals, color
  adjustments, child gate). Kind data lives on the kind's own typed struct, never here.
- Feature field groups and their runtime tiers: `HasAppearance`, `HasBlendMode`, `HasTransform2D`,
  `HasTransform3D`, `HasBoundsRectangle`. Family composition (`Node2DFields`/`Node2DRuntime`) and
  the scene2d back-pointer belong to scene2d.
- The open family traits (`Node`, `Transform2DNode`, `Transform3DNode`, `BoundsNode`,
  `AppearanceNode`) are bounds for shared `Ref<dyn ...>` handles; feature accessors narrow a shared
  node without erasing kind data.
- `hierarchy` owns child attachment and ordering with strong child handles and weak parent links;
  `traversal` walks snapshots; `revision` exposes wrapping revision counters and explicit
  invalidation; `node_transform2d`/`node_transform3d` resolve local and world matrices.
- World-transform revisions are minted from the graph root's `world_transform_revision_counter`
  (never process-global or caller-passed); attach and detach clear the moved subtree's root-minted
  stamps. The reparent guard is caller-owned `NodeGuardState`, replacing the TS module-level state.
- The interaction owner's two runtime slots are opaque `Unknown` fields (`interaction_signals`,
  `interaction_state`); the common node only initializes them to `None` and clears them on
  dispose. Interaction downcasts the same `Arc`s later, preserving identity.

Precision: no f64 values; geometry is f32 throughout.
