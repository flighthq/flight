//! Default velocity contributor: world-transform delta.
//!
//! [`contribute_transform_velocity`] walks a subtree top-down, computes each
//! node's screen-space velocity from the delta of its world-transform
//! translation since the previous frame, and commits the current world
//! transform as the new previous.
//!
//! This is the "any transform is velocity" baseline — a tween, physics step,
//! camera move, or manual edit all change world transforms and so produce
//! velocity for free. Nodes that have already received an explicit contribution
//! this frame (via [`contribute_velocity`]) keep that velocity; only their
//! previous-transform snapshot is updated, so call order with explicit
//! contributors does not matter.
//!
//! Run once per frame after [`begin_velocity_frame`]. Velocity is in node
//! units; a producer (e.g. a motion-blur renderer) scales by the render pixel
//! ratio.

use flighthq_node::{
    HierarchyNode, NodeArena, NodeId, Transform2DNode, get_node_children, get_node_world_matrix,
};
use flighthq_types::VelocityField;
use slotmap::Key;

use crate::velocity_field::ensure_velocity_sample;

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Walks the subtree rooted at `root` top-down, deriving each node's
/// screen-space velocity from the change in world-transform translation
/// since the previous frame.
///
/// - `velocity_field`: the field to write velocity samples into.
/// - `transforms`: the transform arena containing world matrices.
/// - `hierarchy`: the hierarchy arena used to enumerate children.
/// - `root`: the starting node.
///
/// Nodes that already have an explicit contribution this frame
/// (`explicit_frame_id == field.frame_id`) are not overwritten, but their
/// `previous_world_transform` snapshot is still updated.
pub fn contribute_transform_velocity(
    velocity_field: &mut VelocityField,
    transforms: &mut NodeArena<Transform2DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    root: NodeId,
) {
    visit_transform_velocity(velocity_field, transforms, hierarchy, root);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn visit_transform_velocity(
    velocity_field: &mut VelocityField,
    transforms: &mut NodeArena<Transform2DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    node: NodeId,
) {
    // Ensures and reads the up-to-date world matrix (translation only is used).
    let world = get_node_world_matrix(transforms, hierarchy, node);

    let source_id = node.data().as_ffi();
    let frame_id = velocity_field.frame_id;
    let sample = ensure_velocity_sample(velocity_field, source_id);

    // Explicit contributions this frame win regardless of call order; only the
    // previous-transform snapshot is refreshed for those nodes.
    if sample.explicit_frame_id != frame_id {
        match &sample.previous_world_transform {
            Some(previous) => {
                sample.velocity.x = world.tx - previous.tx;
                sample.velocity.y = world.ty - previous.ty;
            }
            None => {
                sample.velocity.x = 0.0;
                sample.velocity.y = 0.0;
            }
        }
        sample.last_frame_id = frame_id;
    }

    match &mut sample.previous_world_transform {
        Some(previous) => *previous = world,
        slot @ None => *slot = Some(world),
    }

    // Children of a transform node in a homogeneous display/sprite graph are
    // themselves transform nodes; the hierarchy arena carries the structure.
    for child in get_node_children(hierarchy, node) {
        visit_transform_velocity(velocity_field, transforms, hierarchy, child);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::velocity_field::{
        begin_velocity_frame, contribute_velocity, create_velocity_field, get_velocity,
    };
    use flighthq_node::{HierarchyArena, Transform2DArena, add_node_child, set_node_transform2d};
    use flighthq_types::Velocity2D;

    // Inserts a node into both arenas in lockstep so their slotmap keys align,
    // returning the shared NodeId.
    fn insert_node(transforms: &mut Transform2DArena, hierarchy: &mut HierarchyArena) -> NodeId {
        let t = transforms.insert(Transform2DNode::default());
        let h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(t, h, "key alignment required");
        t
    }

    fn velocity_of(field: &VelocityField, node: NodeId) -> (f32, f32) {
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity(field, node.data().as_ffi(), &mut out);
        (out.x, out.y)
    }

    // contribute_transform_velocity

    #[test]
    fn contribute_transform_velocity_zero_on_first_frame() {
        let mut field = create_velocity_field();
        let mut transforms = Transform2DArena::new();
        let mut hierarchy = HierarchyArena::new();
        let node = insert_node(&mut transforms, &mut hierarchy);

        contribute_transform_velocity(&mut field, &mut transforms, &hierarchy, node);

        assert_eq!(velocity_of(&field, node), (0.0, 0.0));
    }

    #[test]
    fn contribute_transform_velocity_derives_delta_on_second_frame() {
        let mut field = create_velocity_field();
        let mut transforms = Transform2DArena::new();
        let mut hierarchy = HierarchyArena::new();
        let node = insert_node(&mut transforms, &mut hierarchy);

        contribute_transform_velocity(&mut field, &mut transforms, &hierarchy, node);

        set_node_transform2d(&mut transforms, node, 10.0, -5.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        begin_velocity_frame(&mut field);
        contribute_transform_velocity(&mut field, &mut transforms, &hierarchy, node);

        assert_eq!(velocity_of(&field, node), (10.0, -5.0));
    }

    #[test]
    fn contribute_transform_velocity_does_not_overwrite_explicit_contribution() {
        let mut field = create_velocity_field();
        let mut transforms = Transform2DArena::new();
        let mut hierarchy = HierarchyArena::new();
        let node = insert_node(&mut transforms, &mut hierarchy);

        contribute_transform_velocity(&mut field, &mut transforms, &hierarchy, node);

        set_node_transform2d(&mut transforms, node, 100.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        begin_velocity_frame(&mut field);
        // Explicit set before the baseline runs.
        contribute_velocity(&mut field, node.data().as_ffi(), 2.0, 2.0);
        contribute_transform_velocity(&mut field, &mut transforms, &hierarchy, node);

        assert_eq!(velocity_of(&field, node), (2.0, 2.0));
    }

    #[test]
    fn contribute_transform_velocity_visits_children() {
        let mut field = create_velocity_field();
        let mut transforms = Transform2DArena::new();
        let mut hierarchy = HierarchyArena::new();
        let parent = insert_node(&mut transforms, &mut hierarchy);
        let child = insert_node(&mut transforms, &mut hierarchy);
        add_node_child(&mut hierarchy, parent, child);

        contribute_transform_velocity(&mut field, &mut transforms, &hierarchy, parent);

        set_node_transform2d(&mut transforms, child, 7.0, 3.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        begin_velocity_frame(&mut field);
        contribute_transform_velocity(&mut field, &mut transforms, &hierarchy, parent);

        assert_eq!(velocity_of(&field, child), (7.0, 3.0));
    }
}
