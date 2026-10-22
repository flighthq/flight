use flight_node::{NodeRef, add_node_child};
use flight_render::*;

use crate::support::{NOOP_RENDERER, display_node};

fn registered() -> (BaseRenderState, NodeRef) {
    let mut state = create_render_state();
    let source = display_node();
    register_node_renderer(
        &mut state,
        source.read().unwrap().node_fields().kind.clone(),
        &NOOP_RENDERER,
    );
    return (state, source);
}

mod explain_scene_2d_render {
    use super::*;

    #[test]
    fn render_explanation_reports_missing_renderer() {
        let mut state = create_render_state();
        let source = display_node();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &source);
        let explanation = explain_scene_2d_render(&state, &proxies, &source);
        assert!(!explanation.has_renderer);
        assert_eq!(explanation.reason, Scene2DRenderBlankReason::NoRenderer);
        assert_eq!(explanation.kind, "DisplayObject");
    }

    #[test]
    fn render_explanation_reports_registered_but_not_prepared() {
        let (state, source) = registered();
        let explanation = explain_scene_2d_render(
            &state,
            &crate::support::test_default::<RenderProxies2D<BaseRenderState>>(),
            &source,
        );
        assert!(explanation.has_renderer);
        assert!(!explanation.prepared);
        assert_eq!(explanation.reason, Scene2DRenderBlankReason::NotPrepared);
    }

    #[test]
    fn render_explanation_reports_ok_prepared_node() {
        let (mut state, source) = registered();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &source);
        let explanation = explain_scene_2d_render(&state, &proxies, &source);
        assert!(explanation.prepared && explanation.visible);
        assert_eq!(explanation.effective_alpha, 1.0);
        assert_eq!(explanation.reason, Scene2DRenderBlankReason::Ok);
    }

    #[test]
    fn render_explanation_reports_hidden_node() {
        let mut state = create_render_state();
        let typed = flight_scene2d::create_display_object();
        typed.write().unwrap().visible = false;
        let source: NodeRef = typed;
        register_node_renderer(&mut state, "DisplayObject".to_string(), &NOOP_RENDERER);
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &source);
        let explanation = explain_scene_2d_render(&state, &proxies, &source);
        assert!(!explanation.visible);
        assert_eq!(explanation.reason, Scene2DRenderBlankReason::NotVisible);
    }

    #[test]
    fn render_explanation_reports_zero_effective_alpha() {
        let mut state = create_render_state();
        let typed = flight_scene2d::create_display_object();
        typed.write().unwrap().alpha = 0.0;
        let source: NodeRef = typed;
        register_node_renderer(&mut state, "DisplayObject".to_string(), &NOOP_RENDERER);
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &source);
        let explanation = explain_scene_2d_render(&state, &proxies, &source);
        assert!(explanation.visible);
        assert_eq!(explanation.effective_alpha, 0.0);
        assert_eq!(explanation.reason, Scene2DRenderBlankReason::ZeroAlpha);
    }

    #[test]
    fn render_explanation_reports_hidden_descendant_not_prepared() {
        let mut state = create_render_state();
        let typed_parent = flight_scene2d::create_display_object();
        typed_parent.write().unwrap().visible = false;
        let parent: NodeRef = typed_parent;
        let child = display_node();
        add_node_child(&parent, &child);
        register_node_renderer(&mut state, "DisplayObject".to_string(), &NOOP_RENDERER);
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &parent);
        assert_eq!(
            explain_scene_2d_render(&state, &proxies, &child).reason,
            Scene2DRenderBlankReason::NotPrepared
        );
    }

    #[test]
    fn render_explanation_folds_ancestor_alpha() {
        let mut state = create_render_state();
        let typed_parent = flight_scene2d::create_display_object();
        let typed_child = flight_scene2d::create_display_object();
        typed_parent.write().unwrap().alpha = 0.5;
        typed_child.write().unwrap().alpha = 0.5;
        let parent: NodeRef = typed_parent;
        let child: NodeRef = typed_child;
        add_node_child(&parent, &child);
        register_node_renderer(&mut state, "DisplayObject".to_string(), &NOOP_RENDERER);
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &parent);
        let explanation = explain_scene_2d_render(&state, &proxies, &child);
        assert!((explanation.effective_alpha - 0.25).abs() < f32::EPSILON);
        assert_eq!(explanation.reason, Scene2DRenderBlankReason::Ok);
    }

    #[test]
    fn render_explanation_is_pure_and_never_creates_proxy() {
        let (state, source) = registered();
        let proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let first = explain_scene_2d_render(&state, &proxies, &source);
        let second = explain_scene_2d_render(&state, &proxies, &source);
        assert_eq!(first, second);
        assert!(get_render_proxy_2d(&proxies, &source).is_none());
    }

    #[test]
    fn render_explanation_handles_node_without_appearance_fields() {
        let state = create_render_state();
        let source: NodeRef = flight_scene3d::publish_node3d(flight_scene3d::create_node3d::<
            flight_scene3d::Node3DFields,
        >(None, None));
        let explanation = explain_scene_2d_render(
            &state,
            &crate::support::test_default::<RenderProxies2D<BaseRenderState>>(),
            &source,
        );
        assert_eq!(explanation.kind, flight_scene3d::NODE3D_KIND);
        assert_eq!(explanation.effective_alpha, 1.0);
    }
}
