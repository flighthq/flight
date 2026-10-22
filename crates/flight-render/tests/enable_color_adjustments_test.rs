use std::sync::{Arc, RwLock};

use flight_adjustments::{
    Adjustment, apply_color_matrix_to_color, create_color_matrix_adjustment,
    create_color_scale_bias_adjustment, create_tint_adjustment,
};
use flight_materials::ColorScaleBias;
use flight_materials::color_scale_bias::create_color_scale_bias;
use flight_node::contract::AdjustmentRef;
use flight_node::{NodeRef, add_node_child, set_node_color_adjustments};
use flight_render::*;

use crate::support::display_node;

fn adjustment<T: Adjustment + 'static>(value: T) -> AdjustmentRef {
    let typed: Arc<RwLock<T>> = Arc::new(RwLock::new(value));
    return typed;
}

fn set_adjustments(source: &NodeRef, values: Vec<AdjustmentRef>) {
    set_node_color_adjustments(source, Some(Arc::new(RwLock::new(values))));
}

fn enabled() -> BaseRenderState {
    let mut state = create_render_state();
    enable_color_adjustments(&mut state);
    return state;
}

fn resolve(
    state: &mut BaseRenderState,
    data: &mut RenderProxy<BaseRenderState>,
    parent: Option<&RenderProxy<BaseRenderState>>,
) {
    let resolver = state.registries.color_adjustments.unwrap();
    resolver(state, data, parent);
}

fn scale_bias(red_scale: f32, red_bias: f32) -> AdjustmentRef {
    let value = {
        let mut value = create_color_scale_bias();
        value.red_scale = red_scale;
        value.red_bias = red_bias;
        value.green_scale = 1.0;
        value.green_bias = 0.0;
        value.blue_scale = 1.0;
        value.blue_bias = 0.0;
        value.alpha_scale = 1.0;
        value.alpha_bias = 0.0;
        value
    };
    return adjustment(create_color_scale_bias_adjustment(&value));
}

fn assert_scale_bias_eq(actual: &Option<ColorScaleBias>, expected: &Option<ColorScaleBias>) {
    match (actual, expected) {
        (None, None) => {}
        (Some(actual), Some(expected)) => assert_eq!(
            (
                actual.red_scale.to_bits(),
                actual.green_scale.to_bits(),
                actual.blue_scale.to_bits(),
                actual.alpha_scale.to_bits(),
                actual.red_bias.to_bits(),
                actual.green_bias.to_bits(),
                actual.blue_bias.to_bits(),
                actual.alpha_bias.to_bits(),
            ),
            (
                expected.red_scale.to_bits(),
                expected.green_scale.to_bits(),
                expected.blue_scale.to_bits(),
                expected.alpha_scale.to_bits(),
                expected.red_bias.to_bits(),
                expected.green_bias.to_bits(),
                expected.blue_bias.to_bits(),
                expected.alpha_bias.to_bits(),
            )
        ),
        _ => panic!("color scale/bias presence differs"),
    }
}

mod are_color_adjustments_enabled {
    use super::*;

    #[test]
    fn adjustment_resolver_reports_installation() {
        let mut state = create_render_state();
        assert!(!are_color_adjustments_enabled(&state));
        enable_color_adjustments(&mut state);
        assert!(are_color_adjustments_enabled(&state));
    }
}

mod enable_color_adjustments {
    use super::*;

    #[test]
    fn adjustment_resolver_installation_is_idempotent() {
        let mut state = create_render_state();
        enable_color_adjustments(&mut state);
        let first = state.registries.color_adjustments.unwrap();
        enable_color_adjustments(&mut state);
        assert!(std::ptr::fn_addr_eq(
            state.registries.color_adjustments.unwrap(),
            first
        ));
    }

    #[test]
    fn adjustments_remain_unresolved_until_state_opts_in() {
        let mut state = create_render_state();
        let source = display_node();
        set_adjustments(
            &source,
            vec![adjustment(create_tint_adjustment(0x7f00_00ff))],
        );
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &source);
        assert!(
            get_render_proxy_2d(&proxies, &source)
                .unwrap()
                .color_scale_bias
                .is_none()
        );
    }

    #[test]
    fn tint_stack_resolves_to_affine_color_scale_bias() {
        let mut state = enabled();
        let source = display_node();
        set_adjustments(
            &source,
            vec![adjustment(create_tint_adjustment(0x7f00_00ff))],
        );
        let mut data = create_render_proxy(&mut state, &source);
        resolve(&mut state, &mut data, None);
        let value = data.color_scale_bias.unwrap();
        assert!((value.red_scale - 0x7f as f32 / 255.0).abs() < 1e-6);
        assert_eq!(value.green_scale, 0.0);
    }

    #[test]
    fn channel_mixing_resolves_to_a_complete_matrix() {
        let matrix = [
            1.0, 0.5, 0.0, 0.0, 0.1, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        let mut state = enabled();
        let source = display_node();
        set_adjustments(
            &source,
            vec![adjustment(create_color_matrix_adjustment(matrix))],
        );
        let mut data = create_render_proxy(&mut state, &source);
        resolve(&mut state, &mut data, None);
        assert_eq!(data.color_matrix, Some(matrix));
        assert!(data.color_scale_bias.is_none());
    }

    #[test]
    fn no_adjustments_resolve_to_no_color_values() {
        let mut state = enabled();
        let source = display_node();
        let mut data = create_render_proxy(&mut state, &source);
        resolve(&mut state, &mut data, None);
        assert!(data.color_scale_bias.is_none());
        assert!(data.color_matrix.is_none());
    }

    #[test]
    fn child_inherits_parent_adjustment_when_it_has_none() {
        let mut state = enabled();
        let parent = display_node();
        let child = display_node();
        set_adjustments(
            &parent,
            vec![adjustment(create_tint_adjustment(0x80ff_33ff))],
        );
        let mut parent_data = create_render_proxy(&mut state, &parent);
        let mut child_data = create_render_proxy(&mut state, &child);
        resolve(&mut state, &mut parent_data, None);
        resolve(&mut state, &mut child_data, Some(&parent_data));
        assert_scale_bias_eq(&child_data.color_scale_bias, &parent_data.color_scale_bias);
    }

    #[test]
    fn real_walk_carries_container_adjustment_to_child() {
        let mut state = enabled();
        let parent = display_node();
        let child = display_node();
        add_node_child(&parent, &child);
        set_adjustments(
            &parent,
            vec![adjustment(create_tint_adjustment(0x80ff_33ff))],
        );
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &parent);
        assert_scale_bias_eq(
            &get_render_proxy_2d(&proxies, &child)
                .unwrap()
                .color_scale_bias,
            &get_render_proxy_2d(&proxies, &parent)
                .unwrap()
                .color_scale_bias,
        );
    }

    #[test]
    fn ancestor_changes_refresh_inherited_adjustments() {
        let mut state = enabled();
        let root = display_node();
        let parent = display_node();
        let child = display_node();
        add_node_child(&root, &parent);
        add_node_child(&parent, &child);
        set_adjustments(&root, vec![adjustment(create_tint_adjustment(0x80ff_ffff))]);
        set_adjustments(
            &parent,
            vec![adjustment(create_tint_adjustment(0xff80_33ff))],
        );
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();

        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let first = get_render_proxy_2d(&proxies, &child)
            .unwrap()
            .color_scale_bias
            .as_ref()
            .unwrap();
        assert!((first.red_scale - 0.5).abs() < 0.01);
        assert!((first.green_scale - 0.5).abs() < 0.01);

        set_adjustments(&root, vec![adjustment(create_tint_adjustment(0x40ff_ffff))]);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let second = get_render_proxy_2d(&proxies, &child)
            .unwrap()
            .color_scale_bias
            .as_ref()
            .unwrap();
        assert!((second.red_scale - 0.25).abs() < 0.01);
        assert!((second.green_scale - 0.5).abs() < 0.01);

        set_node_color_adjustments(&parent, None);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert_scale_bias_eq(
            &get_render_proxy_2d(&proxies, &child)
                .unwrap()
                .color_scale_bias,
            &get_render_proxy_2d(&proxies, &root)
                .unwrap()
                .color_scale_bias,
        );
    }

    #[test]
    fn parent_affine_concatenates_after_child_affine() {
        let mut state = enabled();
        let parent = display_node();
        let child = display_node();
        set_adjustments(&parent, vec![scale_bias(0.5, 0.1)]);
        set_adjustments(&child, vec![scale_bias(0.25, 0.2)]);
        let mut parent_data = create_render_proxy(&mut state, &parent);
        let mut child_data = create_render_proxy(&mut state, &child);
        resolve(&mut state, &mut parent_data, None);
        resolve(&mut state, &mut child_data, Some(&parent_data));
        let value = child_data.color_scale_bias.unwrap();
        assert!((value.red_scale - 0.125).abs() < 1e-6);
        assert!((value.red_bias - 0.2).abs() < 1e-6);
    }

    #[test]
    fn parent_affine_and_child_matrix_promote_to_parent_after_child_matrix() {
        let mut state = enabled();
        let parent = display_node();
        let child = display_node();
        let parent_adjustment = scale_bias(0.5, 0.1);
        let parent_matrix = parent_adjustment
            .read()
            .unwrap()
            .adjustment_fields()
            .color_matrix
            .unwrap();
        let child_matrix = [
            0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        set_adjustments(&parent, vec![parent_adjustment]);
        set_adjustments(
            &child,
            vec![adjustment(create_color_matrix_adjustment(child_matrix))],
        );
        let mut parent_data = create_render_proxy(&mut state, &parent);
        let mut child_data = create_render_proxy(&mut state, &child);
        resolve(&mut state, &mut parent_data, None);
        resolve(&mut state, &mut child_data, Some(&parent_data));
        let source = 0x2040_60ff;
        let expected = apply_color_matrix_to_color(
            &parent_matrix,
            apply_color_matrix_to_color(&child_matrix, source),
        );
        assert_eq!(
            apply_color_matrix_to_color(child_data.color_matrix.as_ref().unwrap(), source),
            expected
        );
        assert!(child_data.color_scale_bias.is_none());
    }

    #[test]
    fn parent_matrix_and_child_affine_promote_to_parent_after_child_matrix() {
        let mut state = enabled();
        let parent = display_node();
        let child = display_node();
        let parent_matrix = [
            1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        let child_adjustment = scale_bias(0.5, 0.1);
        let child_matrix = child_adjustment
            .read()
            .unwrap()
            .adjustment_fields()
            .color_matrix
            .unwrap();
        set_adjustments(
            &parent,
            vec![adjustment(create_color_matrix_adjustment(parent_matrix))],
        );
        set_adjustments(&child, vec![child_adjustment]);
        let mut parent_data = create_render_proxy(&mut state, &parent);
        let mut child_data = create_render_proxy(&mut state, &child);
        resolve(&mut state, &mut parent_data, None);
        resolve(&mut state, &mut child_data, Some(&parent_data));
        let source = 0x2040_60ff;
        let expected = apply_color_matrix_to_color(
            &parent_matrix,
            apply_color_matrix_to_color(&child_matrix, source),
        );
        assert_eq!(
            apply_color_matrix_to_color(child_data.color_matrix.as_ref().unwrap(), source),
            expected
        );
        assert!(child_data.color_scale_bias.is_none());
    }

    #[test]
    fn resolver_reuses_the_accessor_fused_cache_value() {
        let mut state = enabled();
        let source = display_node();
        set_adjustments(
            &source,
            vec![adjustment(create_tint_adjustment(0x3fff_ffff))],
        );
        let cached = source
            .read()
            .unwrap()
            .node_runtime()
            .resolved_color_scale_bias
            .clone()
            .unwrap();
        let mut data = create_render_proxy(&mut state, &source);
        resolve(&mut state, &mut data, None);
        assert_scale_bias_eq(&data.color_scale_bias, &Some(cached.clone()));
        resolve(&mut state, &mut data, None);
        assert_scale_bias_eq(&data.color_scale_bias, &Some(cached));
    }
}
