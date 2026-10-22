use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::get_entity_id;
use flight_geometry::{create_matrix, create_rectangle};
use flight_materials::{Material2D, Material2DFields};
use flight_node::{
    NodeRef, RendererDataFields, RendererDataRef, add_node_child, add_node_child_at,
    get_node_appearance_revision, get_node_children_revision, get_node_local_content_revision,
    get_node_local_transform_revision, get_node_parent_reference_revision,
    invalidate_node_appearance, invalidate_node_local_transform, remove_node_child,
};
use flight_render::*;
use flight_scene2d::{Node2DRef, set_node2d_clip};

use crate::support::{NOOP_RENDERER, SECOND_RENDERER, display_node, sprite_node};

#[derive(Default)]
struct TestRendererData {
    renderer_data: RendererDataFields,
    tag: u32,
}

flight_node::impl_renderer_data!(TestRendererData);

static DESTROY_CALLS: AtomicUsize = AtomicUsize::new(0);
static SCENE_DESTROY_CALLS: AtomicUsize = AtomicUsize::new(0);
static DIRTY: AtomicBool = AtomicBool::new(false);
static VISIT_CALLS: AtomicUsize = AtomicUsize::new(0);
static ADAPT_CALLS: AtomicUsize = AtomicUsize::new(0);
static COLOR_CALLS: AtomicUsize = AtomicUsize::new(0);

fn create_data(_state: &mut BaseRenderState, _source: &NodeRef) -> Option<RendererDataRef> {
    let typed: Arc<RwLock<TestRendererData>> = Arc::new(RwLock::new(TestRendererData {
        renderer_data: crate::support::test_default::<RendererDataFields>(),
        tag: 7,
    }));
    return Some(typed);
}

fn destroy_data(_state: &mut BaseRenderState, _data: RendererDataRef) {
    DESTROY_CALLS.fetch_add(1, Ordering::SeqCst);
}

fn destroy_scene_data(_state: &mut BaseRenderState, _data: RendererDataRef) {
    SCENE_DESTROY_CALLS.fetch_add(1, Ordering::SeqCst);
}

fn renderer_dirty(
    _state: &BaseRenderState,
    _source: &NodeRef,
    _data: Option<&RendererDataRef>,
) -> bool {
    return DIRTY.load(Ordering::SeqCst);
}

fn submit(_state: &mut BaseRenderState, _proxy: &RenderProxy2D<BaseRenderState>) {}

static DATA_RENDERER: NodeRenderer<BaseRenderState> = NodeRenderer {
    format: None,
    create_data,
    destroy_data: Some(destroy_data),
    is_dirty: None,
    submit,
};

static DIRTY_RENDERER: NodeRenderer<BaseRenderState> = NodeRenderer {
    format: None,
    create_data,
    destroy_data: None,
    is_dirty: Some(renderer_dirty),
    submit,
};

static SCENE_DATA_RENDERER: NodeRenderer<BaseRenderState> = NodeRenderer {
    format: None,
    create_data,
    destroy_data: Some(destroy_scene_data),
    is_dirty: None,
    submit,
};

fn requires_invalidation_state() -> BaseRenderState {
    let mut state = create_render_state();
    state.render.scene_graph_sync_policy = Scene3DGraphSyncPolicy::RequiresInvalidation;
    return state;
}

fn mark_clean(data: &mut RenderProxy<BaseRenderState>, source: &NodeRef) {
    let source = source.read().unwrap();
    data.last_appearance_id = get_node_appearance_revision(&*source) as i64;
    data.last_children_id = get_node_children_revision(&*source) as i64;
    data.last_local_content_id = get_node_local_content_revision(&*source) as i64;
    data.last_local_transform_id = get_node_local_transform_revision(&*source) as i64;
    data.last_parent_reference_id = get_node_parent_reference_revision(&*source) as i64;
}

fn clip() -> flight_entity::Ref<flight_clip::ClipRegion> {
    return flight_clip::create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 10.0, 10.0));
}

fn clipped_display() -> NodeRef {
    let typed = flight_scene2d::create_display_object(None);
    let family: Node2DRef = typed.clone();
    set_node2d_clip(&family, Some(clip()));
    return typed;
}

fn install_hook(
    _state: &mut BaseRenderState,
    _source: &NodeRef,
    _data: &mut RenderProxy2D<BaseRenderState>,
) {
    ADAPT_CALLS.fetch_add(1, Ordering::SeqCst);
}

fn visitor(
    _state: &mut BaseRenderState,
    _source: &NodeRef,
    _data: &mut RenderProxy2D<BaseRenderState>,
    _parent: Option<&RenderProxy2D<BaseRenderState>>,
) {
    VISIT_CALLS.fetch_add(1, Ordering::SeqCst);
}

fn visitor_noop(
    _state: &mut BaseRenderState,
    _source: &NodeRef,
    _data: &mut RenderProxy2D<BaseRenderState>,
    _parent: Option<&RenderProxy2D<BaseRenderState>>,
) {
}

fn ordered_color_resolver(
    _state: &mut BaseRenderState,
    data: &mut RenderProxy<BaseRenderState>,
    _parent: Option<&RenderProxy<BaseRenderState>>,
) {
    assert!(data.material.is_some());
    assert_eq!(data.last_children_id, -1);
    COLOR_CALLS.fetch_add(1, Ordering::SeqCst);
}

mod create_render_proxy {
    use super::*;

    #[test]
    fn create_proxy_initializes_defaults() {
        let mut state = create_render_state();
        let source = display_node();
        let data = create_render_proxy(&mut state, &source);
        assert!(Arc::ptr_eq(&data.source, &source));
        assert_eq!(data.kind, "DisplayObject");
        assert_eq!(data.next, None);
        assert_eq!(data.alpha, 1.0);
        assert_eq!(data.appearance_frame_id, -1);
        assert_eq!(data.last_appearance_id, -1);
        assert_eq!(data.last_children_id, -1);
        assert_eq!(data.last_local_transform_id, -1);
        assert_eq!(data.last_parent_reference_id, -1);
        assert_eq!(data.transform_frame_id, -1);
        assert!(data.renderer.is_none());
        assert!(data.renderer_data.is_none());
        assert_eq!(
            data.renderer_data_source_id,
            get_entity_id(&*source.read().unwrap())
        );
        assert!(data.visible);
    }

    #[test]
    fn create_proxy_picks_up_registered_renderer_and_data() {
        let mut state = create_render_state();
        let source = display_node();
        register_node_renderer(&mut state, "DisplayObject".to_string(), &DATA_RENDERER);
        let data = create_render_proxy(&mut state, &source);
        assert!(std::ptr::eq(data.renderer.unwrap(), &DATA_RENDERER));
        assert_eq!(
            data.renderer_data
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<TestRendererData>()
                .unwrap()
                .tag,
            7
        );
    }

    #[test]
    fn create_proxy_uses_none_for_unregistered_kind() {
        let mut state = create_render_state();
        assert!(
            create_render_proxy(&mut state, &display_node())
                .renderer
                .is_none()
        );
    }
}

mod create_render_proxy_2d {
    use super::*;

    #[test]
    fn create_proxy_2d_includes_transform_matrix() {
        let mut state = create_render_state();
        let data = create_render_proxy_2d(&mut state, &display_node());
        assert_eq!(
            data.transform_2d,
            create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        );
    }

    #[test]
    fn create_proxy_2d_retains_source() {
        let mut state = create_render_state();
        let source = display_node();
        let data = create_render_proxy_2d(&mut state, &source);
        assert!(Arc::ptr_eq(&data.source, &source));
    }

    #[test]
    fn create_proxy_2d_defaults_match_for_display_and_sprite() {
        let mut state = create_render_state();
        for data in [
            create_render_proxy_2d(&mut state, &display_node()),
            create_render_proxy_2d(&mut state, &sprite_node()),
        ] {
            assert_eq!(data.clip_depth, 0);
            assert!(data.traverse_children);
        }
    }

    #[test]
    fn create_proxy_2d_accepts_concrete_node2d_family_sources() {
        let typed = flight_scene2d::create_display_object(None);
        let family: Node2DRef = typed.clone();
        let source: NodeRef = family;
        let mut state = create_render_state();
        assert!(Arc::ptr_eq(
            &create_render_proxy_2d(&mut state, &source).source,
            &source
        ));
    }
}

mod dispose_render_proxy {
    use super::*;

    #[test]
    fn dispose_proxy_calls_destroy_and_removes_proxy() {
        SCENE_DESTROY_CALLS.store(0, Ordering::SeqCst);
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let source = sprite_node();
        register_node_renderer(&mut state, "Sprite".to_string(), &DATA_RENDERER);
        get_or_create_render_proxy_2d(&mut state, &mut proxies, &source);
        dispose_render_proxy(&mut state, &mut proxies, &source);
        assert_eq!(DESTROY_CALLS.load(Ordering::SeqCst), 1);
        assert!(get_render_proxy_2d(&proxies, &source).is_none());
    }

    #[test]
    fn dispose_missing_proxy_is_noop() {
        let mut state = create_render_state();
        dispose_render_proxy(
            &mut state,
            &mut crate::support::test_default::<RenderProxies2D<BaseRenderState>>(),
            &sprite_node(),
        );
    }
}

mod dispose_scene_2d_render {
    use super::*;

    #[test]
    fn dispose_scene_removes_root_and_all_descendants() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let child = display_node();
        let grandchild = display_node();
        add_node_child(&root, &child);
        add_node_child(&child, &grandchild);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        dispose_scene_2d_render(&mut state, &mut proxies, &root);
        for source in [&root, &child, &grandchild] {
            assert!(get_render_proxy_2d(&proxies, source).is_none());
        }
    }

    #[test]
    fn dispose_scene_handles_sprite_subtree() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = sprite_node();
        let child = sprite_node();
        let grandchild = sprite_node();
        add_node_child(&root, &child);
        add_node_child(&child, &grandchild);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        dispose_scene_2d_render(&mut state, &mut proxies, &root);
        for source in [&root, &child, &grandchild] {
            assert!(get_render_proxy_2d(&proxies, source).is_none());
        }
    }

    #[test]
    fn dispose_scene_destroys_renderer_data_for_each_node() {
        DESTROY_CALLS.store(0, Ordering::SeqCst);
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let child = display_node();
        add_node_child(&root, &child);
        register_node_renderer(
            &mut state,
            "DisplayObject".to_string(),
            &SCENE_DATA_RENDERER,
        );
        get_or_create_render_proxy_2d(&mut state, &mut proxies, &root);
        get_or_create_render_proxy_2d(&mut state, &mut proxies, &child);
        dispose_scene_2d_render(&mut state, &mut proxies, &root);
        assert_eq!(SCENE_DESTROY_CALLS.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn dispose_scene_visits_disabled_never_prepared_nodes() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let child = display_node();
        child.write().unwrap().node_fields_mut().enabled = false;
        add_node_child(&root, &child);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        get_or_create_render_proxy_2d(&mut state, &mut proxies, &child);
        dispose_scene_2d_render(&mut state, &mut proxies, &root);
        assert!(get_render_proxy_2d(&proxies, &child).is_none());
    }
}

mod get_or_create_render_proxy_2d {
    use super::*;

    #[test]
    fn get_or_create_creates_on_first_call() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let source = display_node();
        let data = get_or_create_render_proxy_2d(&mut state, &mut proxies, &source);
        assert!(Arc::ptr_eq(&data.source, &source));
        assert!(data.traverse_children);
    }

    #[test]
    fn get_or_create_returns_same_proxy_subsequently() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let source = display_node();
        let first = get_or_create_render_proxy_2d(&mut state, &mut proxies, &source) as *const _;
        let second = get_or_create_render_proxy_2d(&mut state, &mut proxies, &source) as *const _;
        assert_eq!(first, second);
    }

    #[test]
    fn get_or_create_syncs_proxy_after_renderer_table_replacement() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let source = sprite_node();
        get_or_create_render_proxy_2d(&mut state, &mut proxies, &source);
        assert!(
            get_render_proxy_2d(&proxies, &source)
                .unwrap()
                .renderer
                .is_none()
        );
        let table = state.registries.node_renderers.clone();
        let id = state.runtime.renderer_map_id;
        register_node_renderer(&mut state, "Sprite".to_string(), &DATA_RENDERER);
        assert!(!Arc::ptr_eq(&table, &state.registries.node_renderers));
        assert_eq!(state.runtime.renderer_map_id, id + 1);
        get_or_create_render_proxy_2d(&mut state, &mut proxies, &source);
        let data = get_render_proxy_2d(&proxies, &source).unwrap();
        assert!(std::ptr::eq(data.renderer.unwrap(), &DATA_RENDERER));
        assert_eq!(data.renderer_map_id, state.runtime.renderer_map_id);
    }
}

mod get_render_proxy_2d {
    use super::*;

    #[test]
    fn get_proxy_returns_none_before_creation() {
        assert!(
            get_render_proxy_2d(
                &crate::support::test_default::<RenderProxies2D<BaseRenderState>>(),
                &display_node()
            )
            .is_none()
        );
    }

    #[test]
    fn get_proxy_returns_created_proxy() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let source = display_node();
        let created = get_or_create_render_proxy_2d(&mut state, &mut proxies, &source) as *const _;
        let fetched = get_render_proxy_2d(&proxies, &source).unwrap() as *const _;
        assert_eq!(created, fetched);
    }
}

mod initialize_render_proxy {
    use super::*;

    #[test]
    fn initialize_proxy_restores_construction_values() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy(&mut state, &source);
        data.alpha = 0.0;
        data.kind = "changed".to_string();
        initialize_render_proxy(&mut data, &mut state, &source);
        assert_eq!(data.alpha, 1.0);
        assert_eq!(data.kind, "DisplayObject");
    }

    // The initializer constructs over an existing allocation and keeps its entity identity (D12).
    #[test]
    fn initialize_proxy_keeps_the_receivers_entity_identity() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy(&mut state, &source);
        let id = get_entity_id(&data);
        initialize_render_proxy(&mut data, &mut state, &sprite_node());
        assert_eq!(get_entity_id(&data), id);
        assert_eq!(data.kind, "Sprite");
    }
}

mod initialize_render_proxy_2d {
    use super::*;

    #[test]
    fn initialize_proxy_2d_restores_the_base_and_2d_construction_values() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        data.alpha = 0.0;
        data.transform_2d = create_matrix(2.0, 0.0, 0.0, 2.0, 5.0, 5.0);
        data.traverse_children = false;
        data.clip_depth = 3;
        initialize_render_proxy_2d(&mut data, &mut state, &source);
        assert_eq!(data.alpha, 1.0);
        assert!(Arc::ptr_eq(&data.source, &source));
        assert_eq!(
            data.transform_2d,
            create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        );
        assert!(data.traverse_children);
        assert_eq!(data.clip_depth, 0);
    }

    #[test]
    fn initialize_proxy_2d_keeps_the_receivers_entity_identity() {
        let mut state = create_render_state();
        let mut data = create_render_proxy_2d(&mut state, &display_node());
        let id = get_entity_id(&data.proxy);
        initialize_render_proxy_2d(&mut data, &mut state, &display_node());
        assert_eq!(get_entity_id(&data.proxy), id);
    }
}

mod install_render_adapt_hook {
    use super::*;

    #[test]
    fn install_adapt_hook_accepts_hook() {
        let mut state = create_render_state();
        install_render_adapt_hook(&mut state, install_hook);
    }

    #[test]
    fn install_adapt_hook_writes_runtime_slot() {
        let mut state = create_render_state();
        install_render_adapt_hook(&mut state, install_hook);
        let expected: fn(&mut BaseRenderState, &NodeRef, &mut RenderProxy2D<BaseRenderState>) =
            install_hook;
        assert!(std::ptr::fn_addr_eq(
            state.runtime.render_adapt_hook.unwrap(),
            expected
        ));
    }
}

mod is_render_proxy_dirty {
    use super::*;

    #[test]
    fn dirty_check_is_false_when_source_and_parent_are_clean() {
        let state = requires_invalidation_state();
        let source = display_node();
        let mut local_state = create_render_state();
        let mut data = create_render_proxy_2d(&mut local_state, &source);
        mark_clean(&mut data.proxy, &source);
        assert!(!is_render_proxy_dirty(&state, &source, &data.proxy, None));
    }

    #[test]
    fn dirty_check_detects_appearance_change() {
        let state = requires_invalidation_state();
        let source = display_node();
        let mut local_state = create_render_state();
        let mut data = create_render_proxy_2d(&mut local_state, &source);
        mark_clean(&mut data.proxy, &source);
        invalidate_node_appearance(&source);
        assert!(is_render_proxy_dirty(&state, &source, &data.proxy, None));
    }

    #[test]
    fn dirty_check_detects_parent_update_in_current_frame() {
        let state = requires_invalidation_state();
        let source = display_node();
        let mut local_state = create_render_state();
        let mut data = create_render_proxy_2d(&mut local_state, &source);
        mark_clean(&mut data.proxy, &source);
        let mut parent = create_render_proxy_2d(&mut local_state, &display_node());
        parent.transform_frame_id = state.runtime.current_frame_id as i64;
        assert!(is_render_proxy_dirty(
            &state,
            &source,
            &data.proxy,
            Some(&parent.proxy)
        ));
    }

    #[test]
    fn dirty_check_detects_transform_change() {
        let state = requires_invalidation_state();
        let typed = flight_scene2d::create_display_object(None);
        let source: NodeRef = typed.clone();
        let mut local_state = create_render_state();
        let mut data = create_render_proxy_2d(&mut local_state, &source);
        mark_clean(&mut data.proxy, &source);
        typed.write().unwrap().x = 10.0;
        invalidate_node_local_transform(&source);
        assert!(is_render_proxy_dirty(&state, &source, &data.proxy, None));
    }
}

mod is_render_proxy_visible {
    use super::*;

    #[test]
    fn proxy_with_zero_alpha_is_invisible() {
        let mut state = create_render_state();
        let mut data = create_render_proxy_2d(&mut state, &display_node());
        data.alpha = 0.0;
        assert!(!is_render_proxy_visible(&data));
    }

    #[test]
    fn hidden_proxy_is_invisible() {
        let mut state = create_render_state();
        let mut data = create_render_proxy_2d(&mut state, &display_node());
        data.visible = false;
        assert!(!is_render_proxy_visible(&data));
    }

    #[test]
    fn proxy_collapsed_on_both_axes_is_invisible() {
        let mut state = create_render_state();
        let mut data = create_render_proxy_2d(&mut state, &display_node());
        data.transform_2d.a = 0.0;
        data.transform_2d.d = 0.0;
        assert!(!is_render_proxy_visible(&data));
    }

    #[test]
    fn normal_visible_proxy_is_visible() {
        let mut state = create_render_state();
        assert!(is_render_proxy_visible(&create_render_proxy_2d(
            &mut state,
            &display_node()
        )));
    }
}

mod prepare_scene_2d_render {
    use super::*;

    #[test]
    fn prepare_dirties_warm_proxy_when_reattached_after_another_child() {
        let mut state = requires_invalidation_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let a = display_node();
        let b = display_node();
        add_node_child(&root, &a);
        assert!(prepare_scene_2d_render(&mut state, &mut proxies, &root));
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
        remove_node_child(&root, &a);
        add_node_child(&root, &b);
        assert!(prepare_scene_2d_render(&mut state, &mut proxies, &root));
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
        remove_node_child(&root, &b);
        add_node_child(&root, &a);
        assert!(prepare_scene_2d_render(&mut state, &mut proxies, &root));
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
    }

    #[test]
    fn prepare_detects_removed_child() {
        let mut state = requires_invalidation_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let child = display_node();
        add_node_child(&root, &child);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
        remove_node_child(&root, &child);
        assert!(prepare_scene_2d_render(&mut state, &mut proxies, &root));
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
    }

    #[test]
    fn prepare_detects_reordered_siblings() {
        let mut state = requires_invalidation_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let a = display_node();
        let b = display_node();
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
        add_node_child_at(&root, &a, 1);
        assert!(prepare_scene_2d_render(&mut state, &mut proxies, &root));
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
    }

    #[test]
    fn prepare_recomputes_inheritance_after_reparent() {
        let mut state = requires_invalidation_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let typed_a = flight_scene2d::create_display_object(None);
        let typed_b = flight_scene2d::create_display_object(None);
        let typed_child = flight_scene2d::create_display_object(None);
        {
            let mut a = typed_a.write().unwrap();
            a.x = 10.0;
            a.alpha = 0.5;
        }
        {
            let mut b = typed_b.write().unwrap();
            b.x = 100.0;
            b.alpha = 0.25;
        }
        {
            let mut child = typed_child.write().unwrap();
            child.x = 3.0;
            child.alpha = 0.5;
        }
        let a: NodeRef = typed_a;
        let b: NodeRef = typed_b;
        let child: NodeRef = typed_child;
        for source in [&a, &b, &child] {
            invalidate_node_local_transform(source);
            invalidate_node_appearance(source);
        }
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        add_node_child(&a, &child);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        let first = get_render_proxy_2d(&proxies, &child).unwrap();
        assert_eq!(first.transform_2d.tx, 13.0);
        assert_eq!(first.alpha, 0.25);
        add_node_child(&b, &child);
        assert!(prepare_scene_2d_render(&mut state, &mut proxies, &root));
        let second = get_render_proxy_2d(&proxies, &child).unwrap();
        assert_eq!(second.transform_2d.tx, 103.0);
        assert_eq!(second.alpha, 0.125);
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
    }

    #[test]
    fn prepare_creates_proxies_for_all_enabled_nodes() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let child = display_node();
        add_node_child(&root, &child);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert!(get_render_proxy_2d(&proxies, &root).is_some());
        assert!(get_render_proxy_2d(&proxies, &child).is_some());
    }

    #[test]
    fn prepare_handles_sprite_tree() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = sprite_node();
        let child = sprite_node();
        add_node_child(&root, &child);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert!(get_render_proxy_2d(&proxies, &root).is_some());
        assert!(get_render_proxy_2d(&proxies, &child).is_some());
    }

    #[test]
    fn prepare_skips_disabled_nodes() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        let child = display_node();
        child.write().unwrap().node_fields_mut().enabled = false;
        add_node_child(&root, &child);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert!(get_render_proxy_2d(&proxies, &root).is_some());
        assert!(get_render_proxy_2d(&proxies, &child).is_none());
    }

    #[test]
    fn prepare_returns_true_for_dirty_tree() {
        let mut state = create_render_state();
        assert!(prepare_scene_2d_render(
            &mut state,
            &mut crate::support::test_default::<RenderProxies2D<BaseRenderState>>(),
            &display_node()
        ));
    }

    #[test]
    fn prepare_returns_false_for_clean_tree() {
        let mut state = requires_invalidation_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
    }

    #[test]
    fn prepare_reports_renderer_identity_tier_dirty() {
        DIRTY.store(false, Ordering::SeqCst);
        let mut state = requires_invalidation_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = display_node();
        register_node_renderer(&mut state, "DisplayObject".to_string(), &DIRTY_RENDERER);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert!(!prepare_scene_2d_render(&mut state, &mut proxies, &root));
        DIRTY.store(true, Ordering::SeqCst);
        assert!(prepare_scene_2d_render(&mut state, &mut proxies, &root));
        DIRTY.store(false, Ordering::SeqCst);
    }

    #[test]
    fn prepare_accumulates_clip_depth_through_subtree() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = clipped_display();
        let child = clipped_display();
        let grandchild = display_node();
        add_node_child(&root, &child);
        add_node_child(&child, &grandchild);
        prepare_scene_2d_render(&mut state, &mut proxies, &root);
        assert_eq!(get_render_proxy_2d(&proxies, &root).unwrap().clip_depth, 1);
        assert_eq!(get_render_proxy_2d(&proxies, &child).unwrap().clip_depth, 2);
        assert_eq!(
            get_render_proxy_2d(&proxies, &grandchild)
                .unwrap()
                .clip_depth,
            2
        );
    }
}

mod update_node_clip {
    use super::*;

    #[test]
    fn update_clip_adds_one_for_local_clip() {
        let mut state = create_render_state();
        let source = clipped_display();
        let mut data = create_render_proxy_2d(&mut state, &source);
        update_node_clip(&mut state, &source, &mut data, None);
        assert_eq!(data.clip_depth, 1);
    }

    #[test]
    fn update_clip_inherits_parent_depth_without_local_clip() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        let mut parent = create_render_proxy_2d(&mut state, &display_node());
        parent.clip_depth = 2;
        update_node_clip(&mut state, &source, &mut data, Some(&parent));
        assert_eq!(data.clip_depth, 2);
    }

    #[test]
    fn sprite_without_clip_trait_contributes_no_depth() {
        let mut state = create_render_state();
        let source = sprite_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        update_node_clip(&mut state, &source, &mut data, None);
        assert_eq!(data.clip_depth, 0);
    }
}

mod update_render_proxy_2d {
    use super::*;

    #[test]
    fn update_proxy_2d_updates_display_appearance() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        update_render_proxy_2d(&mut state, &source, &mut data, None);
        assert_eq!(data.alpha, 1.0);
    }

    #[test]
    fn update_proxy_2d_updates_sprite_appearance() {
        let mut state = create_render_state();
        let source = sprite_node();
        let mut data = create_render_proxy_2d(&mut state, &source);
        update_render_proxy_2d(&mut state, &source, &mut data, None);
        assert_eq!(data.alpha, 1.0);
    }

    #[test]
    fn update_proxy_2d_sets_clip_depth() {
        let mut state = create_render_state();
        let source = clipped_display();
        let mut data = create_render_proxy_2d(&mut state, &source);
        update_render_proxy_2d(&mut state, &source, &mut data, None);
        assert_eq!(data.clip_depth, 1);
    }

    #[test]
    fn optional_color_resolver_runs_after_material_before_revision_bookkeeping() {
        COLOR_CALLS.store(0, Ordering::SeqCst);
        let typed = flight_scene2d::create_display_object(None);
        let material: flight_entity::Ref<dyn Material2D> = Arc::new(RwLock::new(
            crate::support::test_default::<Material2DFields>(),
        ));
        typed.write().unwrap().material = Some(material);
        let family: Node2DRef = typed.clone();
        set_node2d_clip(&family, Some(clip()));
        let source: NodeRef = typed;
        let mut state = create_render_state();
        state.registries.color_adjustments = Some(ordered_color_resolver);
        let mut data = create_render_proxy_2d(&mut state, &source);
        update_render_proxy_2d(&mut state, &source, &mut data, None);
        assert_eq!(COLOR_CALLS.load(Ordering::SeqCst), 1);
        assert_eq!(data.clip_depth, 1);
        assert_eq!(
            data.last_children_id,
            get_node_children_revision(&*source.read().unwrap()) as i64
        );
    }
}

mod update_render_proxy_renderer {
    use super::*;

    #[test]
    fn renderer_update_resolves_matching_kind() {
        let mut state = create_render_state();
        let source = display_node();
        register_node_renderer(&mut state, "DisplayObject".to_string(), &NOOP_RENDERER);
        let mut data = create_render_proxy(&mut state, &source);
        data.renderer = None;
        update_render_proxy_renderer(&mut state, &mut data);
        assert!(std::ptr::eq(data.renderer.unwrap(), &NOOP_RENDERER));
    }

    #[test]
    fn renderer_update_clears_missing_registration() {
        let mut state = create_render_state();
        let source = display_node();
        let mut data = create_render_proxy(&mut state, &source);
        data.renderer = Some(&SECOND_RENDERER);
        update_render_proxy_renderer(&mut state, &mut data);
        assert!(data.renderer.is_none());
    }

    #[test]
    fn renderer_update_records_current_map_id() {
        let mut state = create_render_state();
        let mut data = create_render_proxy(&mut state, &display_node());
        data.renderer_map_id = u32::MAX;
        update_render_proxy_renderer(&mut state, &mut data);
        assert_eq!(data.renderer_map_id, state.runtime.renderer_map_id);
    }

    #[test]
    fn renderer_update_rebuilds_data_when_source_changes() {
        let mut state = create_render_state();
        register_node_renderer(&mut state, "DisplayObject".to_string(), &DATA_RENDERER);
        let mut data = create_render_proxy(&mut state, &display_node());
        let next = display_node();
        data.source = next.clone();
        update_render_proxy_renderer(&mut state, &mut data);
        assert_eq!(
            data.renderer_data_source_id,
            get_entity_id(&*next.read().unwrap())
        );
    }
}

mod walk_node {
    use super::*;

    #[test]
    fn walk_calls_visitor_for_each_enabled_node_and_reports_dirty() {
        VISIT_CALLS.store(0, Ordering::SeqCst);
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = sprite_node();
        let child = sprite_node();
        add_node_child(&root, &child);
        assert!(walk_node(&mut state, &mut proxies, &root, visitor));
        assert_eq!(VISIT_CALLS.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn walk_skips_children_when_proxy_disables_traversal() {
        let mut state = create_render_state();
        let mut proxies = crate::support::test_default::<RenderProxies2D<BaseRenderState>>();
        let root = sprite_node();
        let child = sprite_node();
        add_node_child(&root, &child);
        get_or_create_render_proxy_2d(&mut state, &mut proxies, &root).traverse_children = false;
        walk_node(&mut state, &mut proxies, &root, visitor_noop);
        assert!(get_render_proxy_2d(&proxies, &child).is_none());
    }
}
