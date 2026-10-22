use flight_materials::{BLEND_MODE_MULTIPLY, BLEND_MODE_SCREEN};
use flight_node::{NodeRef, invalidate_node_appearance};
use flight_render::*;

use crate::support::display_node;

mod update_render_proxy_appearance {
    use super::*;

    #[test]
    fn appearance_update_returns_true_first_call() {
        let mut state = create_render_state(None);
        let source = display_node();
        let mut data = create_render_proxy(&mut state, &source);
        assert!(update_render_proxy_appearance(&state, &mut data, None));
    }

    #[test]
    fn appearance_update_returns_false_when_unchanged() {
        let mut state = create_render_state(None);
        let source = display_node();
        let mut data = create_render_proxy(&mut state, &source);
        update_render_proxy_appearance(&state, &mut data, None);
        assert!(!update_render_proxy_appearance(&state, &mut data, None));
    }

    #[test]
    fn appearance_update_returns_true_after_invalidation() {
        let mut state = create_render_state(None);
        let source = display_node();
        let mut data = create_render_proxy(&mut state, &source);
        update_render_proxy_appearance(&state, &mut data, None);
        invalidate_node_appearance(&source);
        assert!(update_render_proxy_appearance(&state, &mut data, None));
    }

    #[test]
    fn appearance_update_returns_true_when_parent_changed_this_frame() {
        let mut state = create_render_state(None);
        state.runtime.current_frame_id = 5;
        let mut data = create_render_proxy(&mut state, &display_node());
        let mut parent = create_render_proxy(&mut state, &display_node());
        update_render_proxy_appearance(&state, &mut data, None);
        parent.appearance_frame_id = 5;
        assert!(update_render_proxy_appearance(
            &state,
            &mut data,
            Some(&parent)
        ));
    }

    #[test]
    fn appearance_update_propagates_parent_visibility() {
        let mut state = create_render_state(None);
        state.runtime.current_frame_id = 1;
        let mut data = create_render_proxy(&mut state, &display_node());
        let mut parent = create_render_proxy(&mut state, &display_node());
        parent.visible = false;
        parent.appearance_frame_id = 1;
        update_render_proxy_appearance(&state, &mut data, Some(&parent));
        assert!(!data.visible);
    }

    #[test]
    fn appearance_update_multiplies_parent_alpha() {
        let mut state = create_render_state(None);
        state.runtime.current_frame_id = 1;
        let typed = flight_scene2d::create_display_object(None);
        typed.write().unwrap().alpha = 0.5;
        let source: NodeRef = typed;
        let mut data = create_render_proxy(&mut state, &source);
        let mut parent = create_render_proxy(&mut state, &display_node());
        parent.visible = true;
        parent.alpha = 0.4;
        parent.appearance_frame_id = 1;
        update_render_proxy_appearance(&state, &mut data, Some(&parent));
        assert!((data.alpha - 0.2).abs() < f32::EPSILON);
    }

    #[test]
    fn appearance_update_uses_state_alpha_without_parent() {
        let mut state = create_render_state(None);
        state.render.render_alpha = 0.5;
        let typed = flight_scene2d::create_display_object(None);
        typed.write().unwrap().alpha = 0.6;
        let source: NodeRef = typed;
        let mut data = create_render_proxy(&mut state, &source);
        update_render_proxy_appearance(&state, &mut data, None);
        assert!((data.alpha - 0.3).abs() < f32::EPSILON);
    }

    #[test]
    fn appearance_update_sets_frame_id() {
        let mut state = create_render_state(None);
        state.runtime.current_frame_id = 7;
        let mut data = create_render_proxy(&mut state, &display_node());
        update_render_proxy_appearance(&state, &mut data, None);
        assert_eq!(data.appearance_frame_id, 7);
    }

    #[test]
    fn appearance_update_uses_own_blend_mode_not_parent() {
        let mut state = create_render_state(None);
        state.runtime.current_frame_id = 1;
        let typed = flight_scene2d::create_display_object(None);
        typed.write().unwrap().blend_mode = Some(BLEND_MODE_SCREEN.to_string());
        let source: NodeRef = typed;
        let mut data = create_render_proxy(&mut state, &source);
        let mut parent = create_render_proxy(&mut state, &display_node());
        parent.blend_mode = Some(BLEND_MODE_MULTIPLY.to_string());
        parent.visible = true;
        parent.alpha = 1.0;
        parent.appearance_frame_id = 1;
        update_render_proxy_appearance(&state, &mut data, Some(&parent));
        assert_eq!(data.blend_mode.as_deref(), Some(BLEND_MODE_SCREEN));
    }
}
