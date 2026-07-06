//! Lowers a functional [`Scene`] to the shared harness graph.
//!
//! The backend-agnostic build (shape nodes, fill regions, prepared proxies) lives
//! in `flighthq-harness`; this adapter only maps a `Scene`'s declarative form —
//! axis rects then filled paths — onto the neutral [`HarnessShape`] currency the
//! harness consumes, preserving node order (`STAGE_ID + 1 + index`, rects before
//! paths) so committed fingerprints are unaffected.

use flighthq_harness::{HarnessShape, SceneGraph, ShapeCommand, build_scene_graph as build_graph};

use crate::scene::{Scene, local_transform_for_path, local_transform_for_rect};

/// Builds the drawable graph for a functional scene: each rect becomes a
/// rectangle-command shape and each path a command-list shape, both placed by
/// their local origin/rotation transform, then handed to the shared harness
/// builder.
pub fn build_scene_graph(scene: &Scene) -> SceneGraph {
    let mut shapes: Vec<HarnessShape> = Vec::with_capacity(scene.rects.len() + scene.paths.len());

    for rect in scene.rects {
        shapes.push(
            HarnessShape::new(
                rect.color,
                vec![ShapeCommand::Rectangle(rect.x, rect.y, rect.w, rect.h)],
            )
            .with_transform(local_transform_for_rect(rect)),
        );
    }

    for path in scene.paths {
        shapes.push(
            HarnessShape::new(path.fill_color, path.commands.to_vec())
                .with_transform(local_transform_for_path(path)),
        );
    }

    build_graph(&shapes)
}
