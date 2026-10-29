use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, get_entity_id};
use flight_geometry::{Rectangle, create_rectangle};
use flight_movieclip::MOVIE_CLIP_KIND;
use flight_node::{NodeRef, get_node_local_bounds_rectangle};
use flight_path::{append_path_line_to, append_path_move_to, create_path, create_path_morph};
use flight_scene2d::{Node2DRef, SPRITE_KIND};
use flight_shape::{MorphShape, create_morph_shape, set_morph_shape_progress};
use flight_swf::contract::*;
use flight_texture::{Texture, create_texture};

fn state() -> SwfNodeStateRef {
    return Arc::new(RwLock::new(SwfNodeState {
        bounds_by_node: HashMap::new(),
    }));
}

fn rect(x: f32, y: f32, width: f32, height: f32) -> SwfTagRectangle {
    return SwfTagRectangle {
        height,
        width,
        x,
        y,
    };
}

fn local_bounds(node: &Node2DRef) -> Rectangle {
    let node: NodeRef = node.clone();
    return get_node_local_bounds_rectangle(&node);
}

fn create_segment_morph_shape() -> Ref<MorphShape> {
    let mut start = create_path(Some(flight_path::PathWinding::NonZero));
    append_path_move_to(&mut start, 0.0, 0.0);
    append_path_line_to(&mut start, 10.0, 0.0);
    let mut end = create_path(Some(flight_path::PathWinding::NonZero));
    append_path_move_to(&mut end, 0.0, 0.0);
    append_path_line_to(&mut end, 20.0, 0.0);
    let morph = Arc::new(RwLock::new(create_path_morph(&start, &end).unwrap()));
    return create_morph_shape(&morph);
}

fn morph_with_bounds(state: &SwfNodeStateRef) -> Ref<MorphShape> {
    let shape = create_segment_morph_shape();
    let decoded = shape.clone();
    let decode: SwfMorphShapeDecoder = Arc::new(move || Some(decoded.clone()));
    let _ = create_swf_morph_shape_target(
        state,
        &decode,
        None,
        Some(&SwfMorphBounds {
            end: rect(10.0, 10.0, 20.0, 20.0),
            start: rect(0.0, 0.0, 10.0, 10.0),
        }),
    );
    set_morph_shape_progress(&shape, 0.0);
    return shape;
}

mod apply_swf_authored_bounds {
    use super::*;

    #[test]
    fn makes_the_node_report_the_authored_box_rather_than_its_own_content() {
        let state = state();
        let node = create_swf_display_object(&state, None);
        let node2d: Node2DRef = node.clone();
        apply_swf_authored_bounds(&state, &node2d, Some(&rect(1.0, 2.0, 8.0, 4.0)));
        assert_eq!(local_bounds(&node2d), create_rectangle(1.0, 2.0, 8.0, 4.0));
    }

    #[test]
    fn copies_the_box_rather_than_aliasing_the_caller_value() {
        let state = state();
        let mut bounds = rect(0.0, 0.0, 8.0, 4.0);
        let node = create_swf_display_object(&state, None);
        let node2d: Node2DRef = node.clone();
        apply_swf_authored_bounds(&state, &node2d, Some(&bounds));
        bounds.width = 999.0;
        assert_eq!(bounds.width, 999.0);
        assert_eq!(local_bounds(&node2d).width, 8.0);
    }

    #[test]
    fn installs_nothing_when_there_is_no_authored_box() {
        let state = state();
        let node = create_swf_display_object(&state, None);
        let id = get_entity_id(&*node.read().unwrap()).to_string();
        assert!(!state.read().unwrap().bounds_by_node.contains_key(&id));
    }
}

mod apply_swf_morph_bounds {
    use super::*;

    #[test]
    fn interpolates_the_authored_box_between_the_two_endpoints() {
        let state = state();
        let shape = morph_with_bounds(&state);
        apply_swf_morph_bounds(&state, &shape, 0.5);
        let node: Node2DRef = shape;
        assert_eq!(local_bounds(&node), create_rectangle(5.0, 5.0, 15.0, 15.0));
    }

    #[test]
    fn reports_each_endpoint_exactly_at_the_ends_of_the_range() {
        let state = state();
        let shape = morph_with_bounds(&state);
        apply_swf_morph_bounds(&state, &shape, 0.0);
        let node: Node2DRef = shape.clone();
        assert_eq!(local_bounds(&node), create_rectangle(0.0, 0.0, 10.0, 10.0));
        apply_swf_morph_bounds(&state, &shape, 1.0);
        assert_eq!(
            local_bounds(&node),
            create_rectangle(10.0, 10.0, 20.0, 20.0)
        );
    }

    #[test]
    fn leaves_a_shape_with_no_endpoints_alone() {
        let state = state();
        apply_swf_morph_bounds(&state, &create_segment_morph_shape(), 0.5);
    }
}

mod compute_swf_local_bounds_rectangle {
    use super::*;

    #[test]
    fn writes_the_authored_box_of_the_node_into_the_out_parameter() {
        let state = state();
        let node = create_swf_display_object(&state, Some(&rect(1.0, 2.0, 8.0, 4.0)));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_swf_local_bounds_rectangle(&mut out, &state, &*node.read().unwrap());
        assert_eq!(out, create_rectangle(1.0, 2.0, 8.0, 4.0));
    }

    #[test]
    fn reports_the_box_currently_on_the_node_not_the_one_first_installed() {
        let state = state();
        let node = create_swf_display_object(&state, Some(&rect(0.0, 0.0, 8.0, 4.0)));
        let node2d: Node2DRef = node.clone();
        apply_swf_authored_bounds(&state, &node2d, Some(&rect(0.0, 0.0, 80.0, 40.0)));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_swf_local_bounds_rectangle(&mut out, &state, &*node.read().unwrap());
        assert_eq!(out.width, 80.0);
        assert_eq!(out.height, 40.0);
    }
}

mod create_swf_display_object {
    use super::*;

    #[test]
    fn produces_the_bounded_container_a_placement_without_visual_definition_needs() {
        let state = state();
        let node: Node2DRef = create_swf_display_object(&state, Some(&rect(0.0, 0.0, 8.0, 4.0)));
        assert_eq!(local_bounds(&node).width, 8.0);
        assert_eq!(local_bounds(&node).height, 4.0);
    }
}

mod create_swf_morph_shape_target {
    use super::*;

    #[test]
    fn uses_the_decoded_shape_and_sizes_it_from_the_start_endpoint() {
        let state = state();
        let decoded = create_segment_morph_shape();
        let result = decoded.clone();
        let decode: SwfMorphShapeDecoder = Arc::new(move || Some(result.clone()));
        let target = create_swf_morph_shape_target(
            &state,
            &decode,
            None,
            Some(&SwfMorphBounds {
                end: rect(0.0, 0.0, 20.0, 20.0),
                start: rect(0.0, 0.0, 10.0, 10.0),
            }),
        );
        assert_eq!(
            get_entity_id(&*target.read().unwrap()),
            get_entity_id(&*decoded.read().unwrap())
        );
        assert_eq!(local_bounds(&target).width, 10.0);
        assert_eq!(local_bounds(&target).height, 10.0);
    }

    #[test]
    fn falls_back_to_a_bounded_container_when_the_factory_declines() {
        let state = state();
        let decode: SwfMorphShapeDecoder = Arc::new(|| None);
        let target =
            create_swf_morph_shape_target(&state, &decode, Some(&rect(0.0, 0.0, 8.0, 4.0)), None);
        assert_ne!(target.read().unwrap().node_fields().kind, MOVIE_CLIP_KIND);
        assert_eq!(local_bounds(&target).width, 8.0);
    }

    #[test]
    fn applies_the_placement_extent_when_the_definition_declared_no_endpoints() {
        let state = state();
        let decoded = create_segment_morph_shape();
        let result = decoded.clone();
        let decode: SwfMorphShapeDecoder = Arc::new(move || Some(result.clone()));
        let target =
            create_swf_morph_shape_target(&state, &decode, Some(&rect(0.0, 0.0, 6.0, 6.0)), None);
        assert_eq!(local_bounds(&target).width, 6.0);
        assert_eq!(local_bounds(&target).height, 6.0);
    }
}

mod create_swf_movie_clip {
    use super::*;

    #[test]
    fn produces_a_clip_carrying_the_authored_extent_of_its_symbol() {
        let state = state();
        let clip = create_swf_movie_clip(&state, Some(&rect(0.0, 0.0, 8.0, 4.0)));
        assert_eq!(clip.read().unwrap().kind, MOVIE_CLIP_KIND);
        let node: Node2DRef = clip;
        assert_eq!(local_bounds(&node).width, 8.0);
        assert_eq!(local_bounds(&node).height, 4.0);
    }
}

mod create_swf_textured_sprite {
    use super::*;

    #[test]
    fn samples_the_texture_it_is_given() {
        let state = state();
        let texture = Arc::new(RwLock::new(create_texture(None)));
        let sprite = create_swf_textured_sprite(&state, &texture, None);
        assert_eq!(sprite.read().unwrap().kind, SPRITE_KIND);
        assert!(Arc::ptr_eq(
            sprite.read().unwrap().data.texture.as_ref().unwrap(),
            &texture
        ));
    }

    #[test]
    fn reports_the_authored_extent_before_any_pixels_exist() {
        let state = state();
        let texture: Ref<Texture> = Arc::new(RwLock::new(create_texture(None)));
        let sprite = create_swf_textured_sprite(&state, &texture, Some(&rect(0.0, 0.0, 8.0, 4.0)));
        let node: Node2DRef = sprite;
        assert_eq!(local_bounds(&node).width, 8.0);
        assert_eq!(local_bounds(&node).height, 4.0);
    }
}
