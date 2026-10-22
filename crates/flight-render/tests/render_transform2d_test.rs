use flight_node::NodeRef;
use flight_render::*;

use crate::support::display_node;

mod update_render_proxy_2d_transform {
    use super::*;

    #[test]
    fn transform_update_returns_true_first_call() {
        let mut state = create_render_state();
        let mut data = create_render_proxy_2d(&mut state, &display_node());
        assert!(update_render_proxy_2d_transform(&state, &mut data, None));
    }

    #[test]
    fn transform_update_returns_false_when_unchanged_under_invalidation_policy() {
        let mut state = create_render_state();
        state.render.scene_graph_sync_policy = Scene3DGraphSyncPolicy::RequiresInvalidation;
        let mut data = create_render_proxy_2d(&mut state, &display_node());
        update_render_proxy_2d_transform(&state, &mut data, None);
        assert!(!update_render_proxy_2d_transform(&state, &mut data, None));
    }

    #[test]
    fn transform_update_returns_true_when_parent_changed_this_frame() {
        let mut state = create_render_state();
        state.runtime.current_frame_id = 2;
        let mut parent = create_render_proxy_2d(&mut state, &display_node());
        parent.transform_frame_id = 2;
        let mut data = create_render_proxy_2d(&mut state, &display_node());
        update_render_proxy_2d_transform(&state, &mut data, None);
        assert!(update_render_proxy_2d_transform(
            &state,
            &mut data,
            Some(&parent)
        ));
    }

    #[test]
    fn transform_update_sets_frame_id() {
        let mut state = create_render_state();
        state.runtime.current_frame_id = 5;
        let mut data = create_render_proxy_2d(&mut state, &display_node());
        update_render_proxy_2d_transform(&state, &mut data, None);
        assert_eq!(data.transform_frame_id, 5);
    }

    #[test]
    fn transform_update_multiplies_parent_transform() {
        let mut state = create_render_state();
        let typed_parent = flight_scene2d::create_display_object();
        typed_parent.write().unwrap().x = 10.0;
        let parent_source: NodeRef = typed_parent;
        let mut parent = create_render_proxy_2d(&mut state, &parent_source);
        update_render_proxy_2d_transform(&state, &mut parent, None);
        parent.transform_frame_id = state.runtime.current_frame_id as i64;

        let typed_child = flight_scene2d::create_display_object();
        typed_child.write().unwrap().x = 5.0;
        let child_source: NodeRef = typed_child;
        let mut child = create_render_proxy_2d(&mut state, &child_source);
        update_render_proxy_2d_transform(&state, &mut child, Some(&parent));
        assert!((child.transform_2d.tx - 15.0).abs() < f32::EPSILON);
    }
}
