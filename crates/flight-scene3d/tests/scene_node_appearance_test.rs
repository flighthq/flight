use crate::support::*;
use flight_node::{add_node_child, invalidate_node_appearance};
use flight_scene3d::contract::*;
mod ensure_node3d_world_alpha {
    use super::*;
    #[test]
    fn caches_until_manual_appearance_invalidation() {
        let n = node3d();
        let node = as_node_ref(&n);
        let mut state = Scene3DAppearanceState {
            world_appearance_revision: 0,
        };
        set_node3d_alpha(&node, 0.5);
        close(get_node3d_world_alpha(&node, &mut state), 0.5);
        let id = n
            .read()
            .unwrap()
            .node3d_runtime()
            .appearance
            .world_appearance_id;
        n.write().unwrap().alpha = 0.9;
        ensure_node3d_world_alpha(&node, &mut state);
        close(get_node3d_world_alpha(&node, &mut state), 0.5);
        assert_eq!(
            n.read()
                .unwrap()
                .node3d_runtime()
                .appearance
                .world_appearance_id,
            id
        );
        invalidate_node_appearance(&node);
        close(get_node3d_world_alpha(&node, &mut state), 0.9);
    }
    #[test]
    fn propagates_parent_and_grandparent_changes_through_clean_middle_nodes() {
        let root = as_node_ref(&node3d());
        let mid = as_node_ref(&node3d());
        let leaf = as_node_ref(&node3d());
        add_node_child(&root, &mid);
        add_node_child(&mid, &leaf);
        let mut state = Scene3DAppearanceState {
            world_appearance_revision: 0,
        };
        set_node3d_alpha(&leaf, 0.5);
        close(get_node3d_world_alpha(&leaf, &mut state), 0.5);
        set_node3d_alpha(&root, 0.2);
        close(get_node3d_world_alpha(&leaf, &mut state), 0.1);
        set_node3d_alpha(&root, 1.0);
        set_node3d_alpha(&mid, 0.5);
        close(get_node3d_world_alpha(&leaf, &mut state), 0.25);
        set_node3d_alpha(&mid, 1.0);
        close(get_node3d_world_alpha(&leaf, &mut state), 0.5);
    }
}
mod get_node3d_world_alpha {
    use super::*;
    #[test]
    fn resolves_fresh_and_combined_alpha_on_demand_without_a_render_walk() {
        let p = as_node_ref(&node3d());
        let c = as_node_ref(&node3d());
        let mut state = Scene3DAppearanceState {
            world_appearance_revision: 0,
        };
        close(get_node3d_world_alpha(&p, &mut state), 1.0);
        add_node_child(&p, &c);
        set_node3d_alpha(&p, 0.5);
        set_node3d_alpha(&c, 0.4);
        close(get_node3d_world_alpha(&c, &mut state), 0.2);
        let n = as_node_ref(&node3d());
        set_node3d_alpha(&n, 0.6);
        ensure_node3d_world_alpha(&n, &mut state);
        close(get_node3d_world_alpha(&n, &mut state), 0.6);
    }
}
mod set_node3d_alpha {
    use super::*;
    #[test]
    fn sets_opacity_and_invalidates_resolved_world_alpha() {
        let n = node3d();
        let node = as_node_ref(&n);
        let mut state = Scene3DAppearanceState {
            world_appearance_revision: 0,
        };
        close(get_node3d_world_alpha(&node, &mut state), 1.0);
        set_node3d_alpha(&node, 0.3);
        close(n.read().unwrap().alpha, 0.3);
        close(get_node3d_world_alpha(&node, &mut state), 0.3);
    }
}
