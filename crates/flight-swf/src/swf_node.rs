//! SWF display-node construction and authored bounds (TS `swfNode.ts`).

use std::sync::Arc;

use flight_entity::{Ref, get_entity_id};
use flight_geometry::Rectangle;
use flight_movieclip::{MovieClip, create_movie_clip};
use flight_node::{Node, NodeRef, invalidate_node_local_bounds};
use flight_scene2d::{DisplayObject, Node2DRef, Sprite, create_display_object, create_sprite};
use flight_shape::MorphShape;
use flight_texture::Texture;

use crate::{
    SwfMorphBounds, SwfMorphShapeDecoder, SwfNodeBoundsData, SwfNodeStateRef, SwfTagRectangle,
};

/// Creates an empty display object with an optional authored extent (TS `createSwfDisplayObject`).
// flight-lint: allow(conform-params) D16: caller-owned SwfNodeState preserves source structural data across Rust's typed node kinds
pub fn create_swf_display_object(
    state: &SwfNodeStateRef,
    bounds: Option<&SwfTagRectangle>,
) -> Ref<DisplayObject> {
    let target = create_display_object();
    let node: Node2DRef = target.clone();
    apply_swf_authored_bounds(state, &node, bounds);
    return target;
}

/// Creates one placement-local morph node, or a bounded empty target when decoding declines (TS
/// `createSwfMorphShapeTarget`).
// flight-lint: allow(conform-params) D16: caller-owned SwfNodeState preserves source structural data across Rust's typed node kinds
pub fn create_swf_morph_shape_target(
    state: &SwfNodeStateRef,
    decode: &SwfMorphShapeDecoder,
    bounds: Option<&SwfTagRectangle>,
    morph_bounds: Option<&SwfMorphBounds>,
) -> Node2DRef {
    return create_swf_morph_shape_target_with_handle(state, decode, bounds, morph_bounds).0;
}

pub(crate) fn create_swf_morph_shape_target_with_handle(
    state: &SwfNodeStateRef,
    decode: &SwfMorphShapeDecoder,
    bounds: Option<&SwfTagRectangle>,
    morph_bounds: Option<&SwfMorphBounds>,
) -> (Node2DRef, Option<Ref<MorphShape>>) {
    let Some(shape) = decode() else {
        let target: Node2DRef = create_swf_display_object(state, bounds);
        return (target, None);
    };
    let target: Node2DRef = shape.clone();
    if let Some(morph_bounds) = morph_bounds {
        let node_id = get_entity_id(&*shape.read().unwrap()).to_string();
        state.write().unwrap().bounds_by_node.insert(
            node_id,
            SwfNodeBoundsData {
                authored_bounds: morph_bounds.start,
                morph_end_bounds: Some(morph_bounds.end),
                morph_start_bounds: Some(morph_bounds.start),
            },
        );
        install_swf_bounds_computer(state, &target);
    } else {
        apply_swf_authored_bounds(state, &target, bounds);
    }
    return (target, Some(shape));
}

/// Creates a movie clip with its symbol's authored extent (TS `createSwfMovieClip`).
// flight-lint: allow(conform-params) D16: caller-owned SwfNodeState preserves source structural data across Rust's typed node kinds
pub fn create_swf_movie_clip(
    state: &SwfNodeStateRef,
    bounds: Option<&SwfTagRectangle>,
) -> Ref<MovieClip> {
    let target = create_movie_clip();
    let node: Node2DRef = target.clone();
    apply_swf_authored_bounds(state, &node, bounds);
    return target;
}

/// Creates a texture-backed sprite with an optional authored extent (TS
/// `createSwfTexturedSprite`).
// flight-lint: allow(conform-params) D16: caller-owned SwfNodeState preserves source structural data across Rust's typed node kinds
pub fn create_swf_textured_sprite(
    state: &SwfNodeStateRef,
    texture: &Ref<Texture>,
    bounds: Option<&SwfTagRectangle>,
) -> Ref<Sprite> {
    let target = create_sprite();
    target.write().unwrap().data.texture = Some(texture.clone());
    let node: Node2DRef = target.clone();
    apply_swf_authored_bounds(state, &node, bounds);
    return target;
}

/// Sizes a node by its authored SWF rectangle (TS `applySwfAuthoredBounds`).
// flight-lint: allow(conform-params) D16: caller-owned SwfNodeState preserves source structural data across Rust's typed node kinds
pub fn apply_swf_authored_bounds(
    state: &SwfNodeStateRef,
    node: &Node2DRef,
    bounds: Option<&SwfTagRectangle>,
) {
    let Some(bounds) = bounds else {
        return;
    };
    let node_id = get_entity_id(&*node.read().unwrap()).to_string();
    state
        .write()
        .unwrap()
        .bounds_by_node
        .entry(node_id)
        .and_modify(|data| data.authored_bounds = *bounds)
        .or_insert(SwfNodeBoundsData {
            authored_bounds: *bounds,
            morph_end_bounds: None,
            morph_start_bounds: None,
        });
    install_swf_bounds_computer(state, node);
}

/// Interpolates a morph instance's authored rectangle (TS `applySwfMorphBounds`).
// flight-lint: allow(conform-params) D16: caller-owned SwfNodeState preserves source structural data across Rust's typed node kinds
pub fn apply_swf_morph_bounds(state: &SwfNodeStateRef, shape: &Ref<MorphShape>, progress: f32) {
    let node_id = get_entity_id(&*shape.read().unwrap()).to_string();
    {
        let mut state = state.write().unwrap();
        let Some(data) = state.bounds_by_node.get_mut(&node_id) else {
            return;
        };
        let (Some(start), Some(end)) = (data.morph_start_bounds, data.morph_end_bounds) else {
            return;
        };
        data.authored_bounds = SwfTagRectangle {
            height: start.height + (end.height - start.height) * progress,
            width: start.width + (end.width - start.width) * progress,
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
        };
    }
    let node: NodeRef = shape.clone();
    invalidate_node_local_bounds(&node);
}

/// Copies the current authored rectangle into `out` (TS `computeSwfLocalBoundsRectangle`).
// flight-lint: allow(conform-params) D16: caller-owned SwfNodeState preserves source structural data across Rust's typed node kinds
pub fn compute_swf_local_bounds_rectangle(
    out: &mut Rectangle,
    state: &SwfNodeStateRef,
    source: &dyn Node,
) {
    let node_id = get_entity_id(source).to_string();
    let state = state.read().unwrap();
    let bounds = state
        .bounds_by_node
        .get(&node_id)
        .expect("computeSwfLocalBoundsRectangle: node has no authored bounds")
        .authored_bounds;
    out.x = bounds.x;
    out.y = bounds.y;
    out.width = bounds.width;
    out.height = bounds.height;
}

fn install_swf_bounds_computer(state: &SwfNodeStateRef, node: &Node2DRef) {
    let state = state.clone();
    node.write()
        .unwrap()
        .bounds_runtime_mut()
        .compute_local_bounds_rectangle = Arc::new(move |out, source| {
        compute_swf_local_bounds_rectangle(out, &state, source);
    });
}
