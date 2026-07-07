//! Backend-agnostic scene-graph build, shared by every Rust render target.
//!
//! A slice of [`HarnessShape`]s is plain data. Turning it into a drawable
//! display-object graph — shape nodes, fill regions, per-node local transforms,
//! and the prepared `RenderProxy2D` map — uses only `flighthq-shape` and
//! `flighthq-render`, neither of which is backend-specific. Each render target
//! (`wgpu`, `gl`, `skia`) then wraps the same [`SceneGraph`] in its own geometry
//! type and walks it, so the three cells of the parity matrix render *the same
//! graph*, differing only in the rasterizer.

use std::collections::HashMap;

use flighthq_displayobject::{DisplayObjectArena, get_display_object_local_content_revision};
use flighthq_node::NodeId;
use flighthq_render::{
    RenderStateStore, create_render_state, get_render_proxy_2d, get_render_state,
    prepare_display_object_render,
};
use flighthq_shape::{
    append_shape_begin_fill, append_shape_circle, append_shape_cubic_curve_to,
    append_shape_curve_to, append_shape_ellipse, append_shape_end_fill, append_shape_line_to,
    append_shape_move_to, append_shape_rectangle, append_shape_round_rectangle, create_shape,
    get_shape_fill_regions,
};
use flighthq_types::KindId;
use flighthq_types::ShapeFillRegion;
use flighthq_types::display::{display_object_kind, shape_kind};
use flighthq_types::geometry::Matrix;

use crate::shape::{HarnessShape, ShapeCommand};

/// The stage (root container) node id. Shape nodes start at `STAGE_ID + 1`.
pub const STAGE_ID: u64 = 1;

/// A set of shapes reduced to the backend-agnostic graph every render target
/// consumes: the id hierarchy, each node's kind, the prepared 2D render proxies,
/// and each shape's fill regions. A backend wraps `regions` in its own geometry
/// struct (`WgpuShapeGeometry` / `GlShapeGeometry` / `SkiaShapeGeometry`, all
/// `{ regions: Vec<ShapeFillRegion>, .. }`) and walks via its
/// `render_*_display_object`.
pub struct SceneGraph {
    pub stage_id: u64,
    pub children: HashMap<u64, Vec<u64>>,
    pub kinds: HashMap<u64, KindId>,
    pub proxies: HashMap<u64, flighthq_types::RenderProxy2D>,
    /// Per-shape fill regions and the source `content_revision` they were built
    /// from (the wgpu geometry caches key on it).
    pub regions: HashMap<u64, (Vec<ShapeFillRegion>, u32)>,
}

/// Builds the drawable graph for a set of shapes: one shape node per
/// [`HarnessShape`] under the stage container, with fill regions tessellated and
/// the prepare pass run to publish each node's resolved transform/alpha/
/// visibility into a `RenderProxy2D`. Pure CPU — no GPU device or render target —
/// so it is shared by every backend and is safe to call from any thread. Shape
/// node ids are assigned `STAGE_ID + 1 + index` in slice order.
pub fn build_scene_graph(shapes: &[HarnessShape]) -> SceneGraph {
    let mut shape_arena = DisplayObjectArena::default();
    let mut kinds: HashMap<u64, KindId> = HashMap::new();
    let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
    let mut parents: HashMap<u64, Option<u64>> = HashMap::new();
    let mut regions: HashMap<u64, (Vec<ShapeFillRegion>, u32)> = HashMap::new();
    let mut transforms: HashMap<u64, Matrix> = HashMap::new();

    kinds.insert(STAGE_ID, display_object_kind());
    parents.insert(STAGE_ID, None);
    let mut stage_children = Vec::with_capacity(shapes.len());

    for (index, shape) in shapes.iter().enumerate() {
        let id = STAGE_ID + 1 + index as u64;
        let node = create_shape(&mut shape_arena);
        append_shape_begin_fill(&mut shape_arena, node, shape.fill_color, shape.fill_alpha);
        for command in &shape.commands {
            append_shape_command(&mut shape_arena, node, command);
        }
        append_shape_end_fill(&mut shape_arena, node);
        let content_revision = get_display_object_local_content_revision(&shape_arena, node);
        let fill = get_shape_fill_regions(&shape_arena, node).unwrap_or_default();
        regions.insert(id, (fill, content_revision));
        transforms.insert(id, shape.transform);
        kinds.insert(id, shape_kind());
        children.insert(id, vec![]);
        parents.insert(id, Some(STAGE_ID));
        stage_children.push(id);
    }

    let all_ids: Vec<u64> = std::iter::once(STAGE_ID)
        .chain(stage_children.iter().copied())
        .collect();
    children.insert(STAGE_ID, stage_children);

    let mut store = RenderStateStore::new();
    let render_id = create_render_state(&mut store, None);
    let render_state = get_render_state(&store, render_id).clone();

    let get_children = |id: u64| children.get(&id).cloned().unwrap_or_default();
    let is_enabled = |_id: u64| true;
    let get_parent = |id: u64| parents.get(&id).copied().flatten();
    let get_revisions = |_id: u64| (1u32, 1u32, 1u32);
    let get_kind = |id: u64| kinds.get(&id).copied().unwrap_or_default();
    let get_local_transform = |id: u64| transforms.get(&id).copied().unwrap_or_default();
    let get_alpha = |_id: u64| 1.0f32;
    let get_visible = |_id: u64| true;
    let get_blend = |_id: u64| None;
    let get_clip = |_id: u64| false;

    prepare_display_object_render(
        &mut store,
        render_id,
        &render_state,
        STAGE_ID,
        &get_children,
        &is_enabled,
        &get_parent,
        &get_revisions,
        &get_kind,
        &get_local_transform,
        &get_alpha,
        &get_visible,
        &get_blend,
        &get_clip,
    );

    let mut proxies: HashMap<u64, flighthq_types::RenderProxy2D> = HashMap::new();
    for id in all_ids {
        if let Some(proxy) = get_render_proxy_2d(&store, render_id, id) {
            proxies.insert(id, proxy.clone());
        }
    }

    SceneGraph {
        stage_id: STAGE_ID,
        children,
        kinds,
        proxies,
        regions,
    }
}

/// Applies one [`ShapeCommand`] to a shape node via the `flighthq-shape` drawing
/// API. The whole-primitive commands map to their `append_shape_*` builder; the
/// path commands map to move/line/curve.
fn append_shape_command(arena: &mut DisplayObjectArena, node: NodeId, command: &ShapeCommand) {
    match *command {
        ShapeCommand::MoveTo(x, y) => append_shape_move_to(arena, node, x, y),
        ShapeCommand::LineTo(x, y) => append_shape_line_to(arena, node, x, y),
        ShapeCommand::CurveTo(cx, cy, ax, ay) => append_shape_curve_to(arena, node, cx, cy, ax, ay),
        ShapeCommand::CubicCurveTo(c1x, c1y, c2x, c2y, ax, ay) => {
            append_shape_cubic_curve_to(arena, node, c1x, c1y, c2x, c2y, ax, ay)
        }
        ShapeCommand::Rectangle(x, y, w, h) => append_shape_rectangle(arena, node, x, y, w, h),
        ShapeCommand::Circle(x, y, radius) => append_shape_circle(arena, node, x, y, radius),
        ShapeCommand::Ellipse(x, y, w, h) => append_shape_ellipse(arena, node, x, y, w, h),
        ShapeCommand::RoundRectangle(x, y, w, h, corner_w, corner_h) => {
            append_shape_round_rectangle(arena, node, x, y, w, h, corner_w, corner_h)
        }
    }
}
