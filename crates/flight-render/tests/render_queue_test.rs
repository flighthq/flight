use flight_entity::get_entity_id;
use flight_node::{NodeRef, add_node_child};
use flight_render::*;

use crate::support::{NOOP_RENDERER, display_node, sprite_node};

fn prepared_tree(
    child_count: usize,
) -> (BaseRenderState, RenderProxies2D<BaseRenderState>, NodeRef) {
    let mut state = create_render_state();
    let root = display_node();
    register_node_renderer(
        &mut state,
        root.read().unwrap().node_fields().kind.clone(),
        &NOOP_RENDERER,
    );
    for _ in 0..child_count {
        add_node_child(&root, &display_node());
    }
    let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
    prepare_scene_2d_render(&mut state, &mut proxies, &root);
    return (state, proxies, root);
}

fn descending(a: &RenderQueueEntry, b: &RenderQueueEntry) -> i32 {
    return b.sort_key - a.sort_key;
}

mod build_render_queue {
    use super::*;

    #[test]
    fn build_render_queue_produces_zero_entries_without_renderers() {
        let mut state = create_render_state();
        let root = display_node();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let mut queue = create_render_queue();
        build_render_queue(&state, &proxies, &root, &mut queue);
        assert_eq!(queue.entry_count, 0);
    }

    #[test]
    fn build_render_queue_produces_one_entry_per_visible_rendered_node() {
        let (state, proxies, root) = prepared_tree(1);
        let mut queue = create_render_queue();
        build_render_queue(&state, &proxies, &root, &mut queue);
        assert_eq!(queue.entry_count, 2);
    }

    #[test]
    fn build_render_queue_skips_invisible_proxies() {
        let mut state = create_render_state();
        let typed = flight_scene2d::create_display_object(None);
        typed.write().unwrap().visible = false;
        let root: NodeRef = typed;
        register_node_renderer(
            &mut state,
            root.read().unwrap().node_fields().kind.clone(),
            &NOOP_RENDERER,
        );
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let mut queue = create_render_queue();
        build_render_queue(&state, &proxies, &root, &mut queue);
        assert_eq!(queue.entry_count, 0);
    }

    #[test]
    fn build_render_queue_clears_before_filling() {
        let (state, proxies, root) = prepared_tree(0);
        let mut queue = create_render_queue();
        build_render_queue(&state, &proxies, &root, &mut queue);
        let count = queue.entry_count;
        build_render_queue(&state, &proxies, &root, &mut queue);
        assert_eq!(queue.entry_count, count);
    }

    #[test]
    fn build_render_queue_assigns_increasing_scene_order_keys() {
        let mut state = create_render_state();
        let root = display_node();
        let child_one = display_node();
        let child_two = sprite_node();
        add_node_child(&root, &child_one);
        add_node_child(&root, &child_two);
        for node in [&root, &child_one, &child_two] {
            register_node_renderer(
                &mut state,
                node.read().unwrap().node_fields().kind.clone(),
                &NOOP_RENDERER,
            );
        }
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let mut queue = create_render_queue();
        build_render_queue(&state, &proxies, &root, &mut queue);
        assert!(queue.entries[0].sort_key < queue.entries[1].sort_key);
        assert!(queue.entries[1].sort_key < queue.entries[2].sort_key);
    }
}

mod clear_render_queue {
    use super::*;

    #[test]
    fn clear_render_queue_resets_count() {
        let mut state = create_render_state();
        let proxy = create_render_proxy(&mut state, &display_node());
        let mut queue = create_render_queue();
        push_render_queue_entry(&mut queue, &proxy, 0);
        clear_render_queue(&mut queue);
        assert_eq!(queue.entry_count, 0);
    }

    #[test]
    fn clear_render_queue_preserves_capacity_slots() {
        let mut state = create_render_state();
        let proxy = create_render_proxy(&mut state, &display_node());
        let mut queue = create_render_queue();
        push_render_queue_entry(&mut queue, &proxy, 0);
        clear_render_queue(&mut queue);
        assert_eq!(queue.entries.len(), 1);
    }
}

mod compare_render_queue_entries {
    use super::*;

    #[test]
    fn compare_render_queue_entries_orders_smaller_first() {
        let first = RenderQueueEntry {
            proxy: 1,
            sort_key: 1,
        };
        let second = RenderQueueEntry {
            proxy: 2,
            sort_key: 5,
        };
        assert!(compare_render_queue_entries(&first, &second) < 0);
    }

    #[test]
    fn compare_render_queue_entries_orders_larger_after() {
        let first = RenderQueueEntry {
            proxy: 1,
            sort_key: 5,
        };
        let second = RenderQueueEntry {
            proxy: 2,
            sort_key: 1,
        };
        assert!(compare_render_queue_entries(&first, &second) > 0);
    }

    #[test]
    fn compare_render_queue_entries_returns_zero_for_equal_keys() {
        let first = RenderQueueEntry {
            proxy: 1,
            sort_key: 3,
        };
        let second = RenderQueueEntry {
            proxy: 2,
            sort_key: 3,
        };
        assert_eq!(compare_render_queue_entries(&first, &second), 0);
    }
}

mod create_render_queue {
    use super::*;

    #[test]
    fn create_render_queue_starts_with_zero_count() {
        assert_eq!(create_render_queue().entry_count, 0);
    }

    #[test]
    fn create_render_queue_starts_with_empty_entries() {
        assert!(create_render_queue().entries.is_empty());
    }
}

mod initialize_render_queue {
    use super::*;

    #[test]
    fn initialize_render_queue_is_constructor_initializer() {
        let mut queue = create_render_queue();
        queue.entries.push(RenderQueueEntry {
            proxy: 1,
            sort_key: 3,
        });
        queue.entry_count = 1;
        initialize_render_queue(&mut queue);
        assert!(queue.entries.is_empty());
        assert_eq!(queue.entry_count, 0);
    }
}

mod pack_render_sort_key {
    use super::*;

    #[test]
    fn pack_render_sort_key_orders_opaque_before_transparent() {
        assert!(pack_render_sort_key(0, 0.5, false) < pack_render_sort_key(0, 0.5, true));
    }

    #[test]
    fn pack_render_sort_key_orders_higher_layer_after_lower() {
        assert!(pack_render_sort_key(1, 0.0, false) > pack_render_sort_key(0, 1.0, true));
    }

    #[test]
    fn pack_render_sort_key_orders_depth_within_layer() {
        assert!(pack_render_sort_key(0, 0.9, false) > pack_render_sort_key(0, 0.1, false));
    }

    #[test]
    fn pack_render_sort_key_clamps_layer_and_depth() {
        assert_eq!(pack_render_sort_key(-1, -0.5, false), 0);
        assert_eq!(pack_render_sort_key(99_999, 2.0, true), i32::MAX);
    }
}

mod push_render_queue_entry {
    use super::*;

    #[test]
    fn push_render_queue_entry_increments_count() {
        let mut state = create_render_state();
        let proxy = create_render_proxy(&mut state, &display_node());
        let mut queue = create_render_queue();
        push_render_queue_entry(&mut queue, &proxy, 0);
        assert_eq!(queue.entry_count, 1);
    }

    #[test]
    fn push_render_queue_entry_stores_proxy_identity_and_key() {
        let mut state = create_render_state();
        let proxy = create_render_proxy(&mut state, &display_node());
        let mut queue = create_render_queue();
        push_render_queue_entry(&mut queue, &proxy, 42);
        assert_eq!(queue.entries[0].proxy, get_entity_id(&proxy));
        assert_eq!(queue.entries[0].sort_key, 42);
    }

    #[test]
    fn push_render_queue_entry_reuses_slots_within_capacity() {
        let mut state = create_render_state();
        let first = create_render_proxy(&mut state, &display_node());
        let second = create_render_proxy(&mut state, &display_node());
        let mut queue = create_render_queue();
        push_render_queue_entry(&mut queue, &first, 0);
        clear_render_queue(&mut queue);
        push_render_queue_entry(&mut queue, &second, 1);
        assert_eq!(queue.entries.len(), 1);
        assert_eq!(queue.entries[0].proxy, get_entity_id(&second));
    }
}

mod sort_render_queue {
    use super::*;

    #[test]
    fn sort_render_queue_orders_ascending_by_default() {
        let mut state = create_render_state();
        let proxy = create_render_proxy(&mut state, &display_node());
        let mut queue = create_render_queue();
        for key in [3, 1, 2] {
            push_render_queue_entry(&mut queue, &proxy, key);
        }
        sort_render_queue(&mut queue, None);
        assert_eq!(
            queue
                .entries
                .iter()
                .map(|entry| entry.sort_key)
                .collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn sort_render_queue_accepts_custom_comparator() {
        let mut state = create_render_state();
        let proxy = create_render_proxy(&mut state, &display_node());
        let mut queue = create_render_queue();
        for key in [1, 3, 2] {
            push_render_queue_entry(&mut queue, &proxy, key);
        }
        sort_render_queue(&mut queue, Some(descending));
        assert_eq!(
            queue
                .entries
                .iter()
                .map(|entry| entry.sort_key)
                .collect::<Vec<_>>(),
            vec![3, 2, 1]
        );
    }

    #[test]
    fn sort_render_queue_only_sorts_valid_window() {
        let mut state = create_render_state();
        let proxy = create_render_proxy(&mut state, &display_node());
        let mut queue = create_render_queue();
        for key in [3, 1, 2] {
            push_render_queue_entry(&mut queue, &proxy, key);
        }
        clear_render_queue(&mut queue);
        for key in [5, 4] {
            push_render_queue_entry(&mut queue, &proxy, key);
        }
        sort_render_queue(&mut queue, None);
        assert_eq!(queue.entry_count, 2);
        assert_eq!(
            (queue.entries[0].sort_key, queue.entries[1].sort_key),
            (4, 5)
        );
        assert_eq!(queue.entries[2].sort_key, 2);
    }
}
