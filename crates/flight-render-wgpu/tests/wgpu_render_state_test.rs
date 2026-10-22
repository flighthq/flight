use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use flight_entity::{Kind, Ref, UnknownValue, get_entity_id};
use flight_materials::BlendMode;
use flight_node::{NodeRef, RendererDataRef};
use flight_registry::{KindMap, with_kind_map_entry};
use flight_render::{
    EffectPadding, EffectPaddingResolver, NodeRenderer, RenderProxies2D, RenderProxy2D,
    RenderState, enable_color_adjustment_guards, enable_color_adjustments,
    get_color_adjustment_unsupported_guard, get_render_state_runtime, prepare_scene_2d_render,
    register_node_renderer,
};
use flight_render_wgpu::*;
use flight_surface::WgpuHostAcquisitionOwnership;
use flight_texture::contract::{TextureColorSpace, TextureVariant, TextureWrap};

use crate::support::*;

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .unwrap_or_else(String::new);
}

fn empty_map<T>() -> KindMap<T> {
    return KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
}

fn acme_effect_runner(_context: &mut WgpuEffectContext<'_>, _effect: &dyn flight_effects::Effect) {}

fn create_test_device() -> flight_host::WgpuDevice {
    return create_test_wgpu_device(create_test_native_device());
}

// The source's `createWgpuOffscreenRenderState(source)` arm, unwrapped to its derived state.
fn derive_offscreen(source: &WgpuRenderState) -> WgpuRenderState {
    return match create_wgpu_offscreen_render_state(source) {
        WgpuOffscreenRenderStateResult::Ok(ok) => ok.state,
        WgpuOffscreenRenderStateResult::DeviceLost(_) => {
            panic!("derive_offscreen: the source device is lost")
        }
    };
}

fn proxies() -> RenderProxies2D<WgpuRenderState> {
    return test_default();
}

fn native(state: &WgpuRenderState) -> WgpuNativeDevice {
    return get_wgpu_render_state_native_device(state);
}

fn encoder_identity(state: &WgpuRenderState) -> String {
    return format!("{:?}", get_wgpu_render_state_runtime(state).command_encoder);
}

// Destroys the native device and lets wgpu complete the loss, so the device tier records it.
fn lose_device(state: &WgpuRenderState) {
    let native = native(state);
    native.device.destroy();
    for _ in 0..8 {
        if is_wgpu_device_lost(state) {
            return;
        }
        let _ = native.device.poll(wgpu::PollType::Poll);
        // The loss reaches the tier through its spawned continuation (Principal 2ec2343a).
        drain_test_spawned();
    }
}

fn get_padding_resolver(state: &WgpuRenderState, kind: &str) -> Option<EffectPaddingResolver> {
    return state
        .render_registries()
        .effect_padding_resolvers
        .as_ref()
        .and_then(|table| table.entries.get(kind).copied());
}

fn register_padding_resolver(
    state: &mut WgpuRenderState,
    kind: &str,
    resolver: EffectPaddingResolver,
) {
    let registries = state.render_registries_mut();
    let table = registries
        .effect_padding_resolvers
        .clone()
        .unwrap_or_else(|| Arc::new(empty_map()));
    registries.effect_padding_resolvers = Some(Arc::new(with_kind_map_entry(
        &table,
        kind.to_string(),
        resolver,
    )));
}

fn quad_renderer(marker: u32) -> WgpuQuadMaterialRenderer {
    return WgpuQuadMaterialRenderer {
        instance_float_count: marker,
        get_shader_module: unused_shader_module,
        pack_instance: None,
    };
}

fn unused_shader_module(_state: &mut WgpuRenderState) -> wgpu::ShaderModule {
    panic!("the test material renderer is never drawn");
}

fn quad_marker(state: &WgpuRenderState, kind: &str) -> Option<u32> {
    return get_wgpu_quad_material_renderer(state, &kind.to_string())
        .map(|renderer| renderer.instance_float_count);
}

fn null_texture_resolver(
    _state: &mut WgpuRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    return None;
}

fn padding_one(_effect: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 1.0,
        left: 1.0,
        right: 1.0,
        top: 1.0,
    };
}

fn padding_two(_effect: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 2.0,
        left: 2.0,
        right: 2.0,
        top: 2.0,
    };
}

fn no_data(_state: &mut WgpuRenderState, _source: &NodeRef) -> Option<RendererDataRef> {
    return None;
}

fn some_data(_state: &mut WgpuRenderState, _source: &NodeRef) -> Option<RendererDataRef> {
    return Some(create_test_renderer_data());
}

fn submit_nothing(_state: &mut WgpuRenderState, _proxy: &RenderProxy2D<WgpuRenderState>) {}

fn root_guard(state: &mut WgpuRenderState, _root: &NodeRef) {
    state.render_state_mut().render_alpha = 0.25;
}

// Distinct bodies keep the three hooks distinct functions.
fn screen_hook(state: &mut WgpuRenderState, _mode: Option<&BlendMode>) {
    state.render_state_mut().render_alpha = 0.1;
}

fn later_screen_hook(state: &mut WgpuRenderState, _mode: Option<&BlendMode>) {
    state.render_state_mut().render_alpha = 0.2;
}

fn offscreen_hook(state: &mut WgpuRenderState, _mode: Option<&BlendMode>) {
    state.render_state_mut().render_alpha = 0.3;
}

fn is_hook(resolved: Option<WgpuApplyBlendMode>, expected: WgpuApplyBlendMode) -> bool {
    return resolved.is_some_and(|hook| std::ptr::fn_addr_eq(hook, expected));
}

fn set_hook(state: &WgpuRenderState, hook: Option<WgpuApplyBlendMode>) {
    *state.apply_blend_mode.write().unwrap() = hook;
}

static NODE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: no_data,
    destroy_data: None,
    is_dirty: None,
    submit: submit_nothing,
};

static LATE_NODE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: no_data,
    destroy_data: None,
    is_dirty: None,
    submit: submit_nothing,
};

static DATA_NODE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: some_data,
    destroy_data: None,
    is_dirty: None,
    submit: submit_nothing,
};

static DESTROY_DATA_CALLS: AtomicU32 = AtomicU32::new(0);

fn count_destroy_data(_state: &mut WgpuRenderState, _data: RendererDataRef) {
    DESTROY_DATA_CALLS.fetch_add(1, Ordering::SeqCst);
}

static DESTROYING_NODE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: None,
    create_data: some_data,
    destroy_data: Some(count_destroy_data),
    is_dirty: None,
    submit: submit_nothing,
};

fn is_node_renderer(
    state: &WgpuRenderState,
    kind: &str,
    expected: &'static NodeRenderer<WgpuRenderState>,
) -> bool {
    return state
        .render_registries()
        .node_renderers
        .entries
        .get(kind)
        .is_some_and(|renderer| std::ptr::eq(*renderer, expected));
}

// A device-tier teardown that records the device it was handed.
fn recording_device_teardown() -> (WgpuDeviceTeardown, Arc<Mutex<Vec<wgpu::Device>>>) {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let recorded = calls.clone();
    let teardown: WgpuDeviceTeardown = Arc::new(move |device: &WgpuNativeDevice| {
        recorded.lock().unwrap().push(device.device.clone());
    });
    return (teardown, calls);
}

// A state-tier teardown that records the entity id of the state it was handed.
fn recording_state_teardown() -> (WgpuRenderStateTeardown, Arc<Mutex<Vec<u64>>>) {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let recorded = calls.clone();
    let teardown: WgpuRenderStateTeardown = Arc::new(move |state: &mut WgpuRenderState| {
        recorded.lock().unwrap().push(get_entity_id(state));
    });
    return (teardown, calls);
}

mod build_wgpu_render_registries {
    use super::*;

    // The backend-neutral tables (node renderers, stroke tessellator) live in the state's
    // `RenderRegistries`; a fresh state shows their defaults beside the WGPU aggregate.
    #[test]
    fn returns_all_required_fields_with_default_values() {
        let registries = build_wgpu_render_registries(&test_default());
        assert!(registries.material_renderers.entries.is_empty());
        assert!(registries.modifier_snippets.entries.is_empty());
        assert!(registries.texture_resolvers.entries.is_empty());
        assert!(registries.gpu_skinning.is_none());

        let state = create_wgpu_render_state_for_test(None);
        assert!(state.render_registries().node_renderers.entries.is_empty());
        assert!(state.render_registries().stroke_tessellator.is_none());
    }

    // Options own their tables by value, so isolation is observed by mutating the caller's tables
    // after the build.
    #[test]
    fn clones_provided_registry_maps_and_pass_arrays_into_an_isolated_live_aggregate() {
        let mut options = WgpuRenderStateOptions {
            material_renderers: Some(empty_map()),
            passes: Some(Vec::new()),
            ..test_default()
        };
        let registries = build_wgpu_render_registries(&options);

        let late: Kind = "acme.Late".to_string();
        options.material_renderers = Some(with_kind_map_entry(
            options.material_renderers.as_ref().unwrap(),
            late.clone(),
            WgpuMaterialRenderer::Quad(quad_renderer(1)),
        ));
        let pass: UnknownValue = Arc::new("acme.Pass");
        options.passes.as_mut().unwrap().push(pass);

        assert!(!registries.material_renderers.entries.contains_key(&late));
        assert_eq!(
            registries.passes.as_ref().map(|passes| passes.len()),
            Some(0)
        );
    }
}

mod create_wgpu_acquisition {
    use super::*;

    #[test]
    fn hands_back_handles_the_caller_owns_so_no_state_teardown_can_release_them() {
        let (host, record) = create_test_wgpu_host();
        let canvas = create_test_canvas(800, 600);
        let surface = create_test_wgpu_surface(&canvas);

        let acquisition = block_on(create_wgpu_acquisition(&host, &surface, None));

        let acquisition = acquisition.expect("the test host acquires");
        assert_eq!(acquisition.ownership, WgpuHostAcquisitionOwnership::Caller);
        assert_eq!((acquisition.surface.width)(), 800.0);
        assert_eq!((acquisition.surface.height)(), 600.0);
        release_wgpu_acquisition(&host, &acquisition);
        assert_eq!(record.release_count.load(Ordering::SeqCst), 1);
    }

    // NONE, NOT PANIC. "This environment cannot give me WebGPU" is an expected outcome, not API misuse,
    // so it reports through the return value like every other expected failure in this SDK.
    #[test]
    fn returns_null_when_the_host_cannot_acquire_rather_than_rejecting() {
        let (host, record) = create_test_wgpu_host();
        record.refuse_acquire.store(true, Ordering::SeqCst);
        let surface = create_test_wgpu_surface(&create_test_canvas(800, 600));

        assert!(block_on(create_wgpu_acquisition(&host, &surface, None)).is_none());
        assert_eq!(record.acquire_count.load(Ordering::SeqCst), 1);
    }
}

mod create_wgpu_device_state {
    use super::*;

    #[test]
    fn allocates_distinct_owners_for_repeated_calls_with_the_same_raw_device() {
        let device = create_test_device();
        let first = create_wgpu_device_state(&device);
        let second = create_wgpu_device_state(&device);
        assert_ne!(get_entity_id(&first), get_entity_id(&second));
        assert!(!Arc::ptr_eq(
            &get_wgpu_device_runtime(&first),
            &get_wgpu_device_runtime(&second)
        ));
    }

    // A Rust device state cannot be written as a literal outside the crate (its runtime fields are
    // private); the constructed entity carries an allocated identity and its device tier.
    #[test]
    fn rejects_a_plain_literal_at_the_entity_boundary_entity_runtime_key_is_absent_without_allocate_entity()
     {
        let device = create_test_device();
        let entity = create_wgpu_device_state(&device);
        assert!(get_entity_id(&entity) > 0);
        assert!(Arc::ptr_eq(&entity.device.handle, &device.handle));
        assert_eq!(
            get_wgpu_device_runtime(&entity).read().unwrap().references,
            0
        );
    }

    #[test]
    fn returns_a_state_that_shares_the_device_tier_across_derived_runtimes() {
        let device_state = create_wgpu_device_state(&create_test_device());
        let runtime_a = create_wgpu_render_state_runtime(&device_state, None);
        let runtime_b = create_wgpu_render_state_runtime(&device_state, None);
        let module = {
            let native = runtime_a.context.read().unwrap().native.clone();
            native
                .device
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("test-standard-material"),
                    source: wgpu::ShaderSource::Wgsl(
                        "@vertex fn vs() -> @builtin(position) vec4<f32> { return vec4<f32>(); }"
                            .into(),
                    ),
                })
        };
        runtime_a.context.write().unwrap().standard_material_module = Some(module.clone());
        assert_eq!(
            runtime_b.context.read().unwrap().standard_material_module,
            Some(module)
        );
    }

    #[test]
    fn represents_device_native_resources_as_absent_before_the_first_render_state_initializes_them()
    {
        let runtime = get_wgpu_device_runtime(&create_wgpu_device_state(&create_test_device()));
        assert!(runtime.read().unwrap().resources.is_none());
    }
}

mod create_wgpu_offscreen_render_state {
    use super::*;

    // The source re-links `applyBlendModeParent` to a state; here the derivation link is re-pointed at
    // the screen's hook cell and the screen's own link.
    #[test]
    fn resolves_late_screen_blend_mode_wiring_explicitly_until_locally_overridden() {
        let screen = create_wgpu_render_state_for_test(None);
        let offscreen = derive_offscreen(&screen);
        let nested = derive_offscreen(&offscreen);

        assert!(offscreen.apply_blend_mode.read().unwrap().is_none());
        assert!(!Arc::ptr_eq(
            &offscreen.apply_blend_mode,
            &screen.apply_blend_mode
        ));
        assert!(resolve_wgpu_apply_blend_mode(&offscreen).is_none());
        set_hook(&screen, Some(screen_hook));
        assert!(offscreen.apply_blend_mode.read().unwrap().is_none());
        assert!(is_hook(
            resolve_wgpu_apply_blend_mode(&offscreen),
            screen_hook
        ));
        assert!(is_hook(resolve_wgpu_apply_blend_mode(&nested), screen_hook));

        set_hook(&offscreen, Some(offscreen_hook));
        set_hook(&screen, Some(later_screen_hook));
        assert!(is_hook(
            resolve_wgpu_apply_blend_mode(&offscreen),
            offscreen_hook
        ));
        assert!(is_hook(
            resolve_wgpu_apply_blend_mode(&nested),
            offscreen_hook
        ));

        set_hook(&offscreen, None);
        *get_wgpu_render_state_runtime(&offscreen)
            .apply_blend_mode_parent
            .write()
            .unwrap() = Some(WgpuApplyBlendModeParent {
            apply_blend_mode: screen.apply_blend_mode.clone(),
            parent: get_wgpu_render_state_runtime(&screen)
                .apply_blend_mode_parent
                .clone(),
        });
        assert!(offscreen.apply_blend_mode.read().unwrap().is_none());
        assert!(is_hook(
            resolve_wgpu_apply_blend_mode(&offscreen),
            later_screen_hook
        ));
    }

    // Registration tables are persistent `Arc` snapshots (copy-on-write), so the source's "a new Map"
    // identity checks become isolation checks: a write on one state after derivation is not seen by
    // the other. Shared slots keep their `Arc`/fn identity.
    #[test]
    fn shares_device_resources_while_snapshotting_independent_registration_policy() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let color_adjustment_feature: UnknownValue = Arc::new("acme.ColorFeature");
        let color_adjustment_feature_guard: UnknownValue = Arc::new("acme.ColorFeatureGuard");
        let effect = WgpuEffectRegistration {
            is_resolvable: None,
            runner: acme_effect_runner,
        };
        register_node_renderer(&mut screen, "acme.Node".to_string(), &NODE_RENDERER);
        register_wgpu_quad_material_renderer(
            &mut screen,
            "acme.Material".to_string(),
            quad_renderer(1),
        );
        register_wgpu_texture_resolver(
            &mut screen,
            "acme.Texture".to_string(),
            Some(null_texture_resolver),
        );
        enable_color_adjustments(&mut screen);
        enable_color_adjustment_guards(&mut screen, None);
        register_padding_resolver(&mut screen, "acme.Effect", padding_one);
        {
            let registries = &mut get_wgpu_render_state_runtime_mut(&mut screen).registries;
            registries.color_adjustment_feature = Some(color_adjustment_feature.clone());
            registries.color_adjustment_feature_guard =
                Some(color_adjustment_feature_guard.clone());
            registries.effects = Arc::new(with_kind_map_entry(
                &registries.effects,
                "acme.Effect".to_string(),
                effect,
            ));
        }
        screen.render_registries_mut().render_root_guard = Some(root_guard);
        get_wgpu_render_state_runtime(&screen)
            .context
            .write()
            .unwrap()
            .wgpu_render_texture_cache = Some(std::collections::HashMap::new());

        let mut offscreen = derive_offscreen(&screen);

        assert!(Arc::ptr_eq(&offscreen.device.handle, &screen.device.handle));
        assert!(Arc::ptr_eq(
            &get_wgpu_render_state_runtime(&offscreen).context,
            &get_wgpu_render_state_runtime(&screen).context
        ));
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .context
                .read()
                .unwrap()
                .wgpu_render_texture_cache
                .is_some()
        );
        assert_ne!(
            get_wgpu_render_state_runtime(&offscreen).uniform_buffer,
            get_wgpu_render_state_runtime(&screen).uniform_buffer
        );

        let same_value = |a: &Option<UnknownValue>, b: &UnknownValue| {
            return a.as_ref().is_some_and(|a| Arc::ptr_eq(a, b));
        };
        assert!(same_value(
            &get_wgpu_render_state_runtime(&offscreen)
                .registries
                .color_adjustment_feature,
            &color_adjustment_feature
        ));
        assert!(same_value(
            &get_wgpu_color_adjustment_material_feature(&offscreen),
            &color_adjustment_feature
        ));
        assert!(same_value(
            &get_wgpu_color_adjustment_material_feature_guard(&offscreen),
            &color_adjustment_feature_guard
        ));
        get_wgpu_render_state_runtime_mut(&mut screen)
            .registries
            .color_adjustment_feature_guard = None;
        assert!(get_wgpu_color_adjustment_material_feature_guard(&screen).is_none());
        assert!(same_value(
            &get_wgpu_color_adjustment_material_feature_guard(&offscreen),
            &color_adjustment_feature_guard
        ));
        get_wgpu_render_state_runtime_mut(&mut screen)
            .registries
            .color_adjustment_feature = None;
        assert!(get_wgpu_color_adjustment_material_feature(&screen).is_none());
        assert!(same_value(
            &get_wgpu_color_adjustment_material_feature(&offscreen),
            &color_adjustment_feature
        ));

        let screen_color_adjustments = screen.render_registries().color_adjustments.unwrap();
        assert!(
            offscreen
                .render_registries()
                .color_adjustments
                .is_some_and(|resolver| std::ptr::fn_addr_eq(resolver, screen_color_adjustments))
        );
        let shared_unsupported_guard = get_color_adjustment_unsupported_guard(&screen).unwrap();
        assert!(
            get_color_adjustment_unsupported_guard(&offscreen)
                .is_some_and(|guard| std::ptr::fn_addr_eq(guard, shared_unsupported_guard))
        );
        screen
            .render_registries_mut()
            .color_adjustment_unsupported_guard = None;
        assert!(get_color_adjustment_unsupported_guard(&screen).is_none());
        assert!(
            get_color_adjustment_unsupported_guard(&offscreen)
                .is_some_and(|guard| std::ptr::fn_addr_eq(guard, shared_unsupported_guard))
        );
        let is_root_guard = |state: &WgpuRenderState| {
            return state
                .render_registries()
                .render_root_guard
                .is_some_and(|guard| {
                    let expected: flight_render::RenderRootGuard<WgpuRenderState> = root_guard;
                    return std::ptr::fn_addr_eq(guard, expected);
                });
        };
        assert!(is_root_guard(&offscreen));
        screen.render_registries_mut().render_root_guard = None;
        assert!(screen.render_registries().render_root_guard.is_none());
        assert!(is_root_guard(&offscreen));

        {
            let offscreen_registries = &get_wgpu_render_state_runtime(&offscreen).registries;
            let screen_registries = &get_wgpu_render_state_runtime(&screen).registries;
            assert!(offscreen_registries.compressed_texture_decoder.is_none());
            assert!(screen_registries.compressed_texture_decoder.is_none());
            assert!(offscreen_registries.compressed_texture_upload.is_none());
            assert!(screen_registries.compressed_texture_upload.is_none());
            assert!(offscreen_registries.shape_rasterizer.is_none());
            assert!(screen_registries.shape_rasterizer.is_none());
        }
        assert!(offscreen.render_registries().stroke_tessellator.is_none());
        assert_eq!(
            get_wgpu_render_state_runtime(&offscreen).modifier_snippet_revision,
            get_wgpu_render_state_runtime(&screen).modifier_snippet_revision
        );

        assert!(is_node_renderer(&offscreen, "acme.Node", &NODE_RENDERER));
        assert_eq!(quad_marker(&offscreen, "acme.Material"), Some(1));
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .registries
                .texture_resolvers
                .entries
                .get("acme.Texture")
                .is_some_and(|resolver| {
                    let expected: WgpuTextureResolver = null_texture_resolver;
                    return std::ptr::fn_addr_eq(*resolver, expected);
                })
        );
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .registries
                .effects
                .entries
                .get("acme.Effect")
                .is_some_and(|value| std::ptr::fn_addr_eq(value.runner, effect.runner))
        );
        assert!(
            get_padding_resolver(&offscreen, "acme.Effect").is_some_and(|resolver| {
                let expected: EffectPaddingResolver = padding_one;
                return std::ptr::fn_addr_eq(resolver, expected);
            })
        );

        // Writes on the derived state after derivation stay on the derived state.
        register_node_renderer(
            &mut offscreen,
            "acme.OnlyOffscreen".to_string(),
            &LATE_NODE_RENDERER,
        );
        register_wgpu_quad_material_renderer(
            &mut offscreen,
            "acme.OnlyOffscreen".to_string(),
            quad_renderer(2),
        );
        register_wgpu_texture_resolver(&mut offscreen, "acme.Texture".to_string(), None);
        register_padding_resolver(&mut offscreen, "acme.OnlyOffscreen", padding_two);
        {
            let registries = &mut get_wgpu_render_state_runtime_mut(&mut offscreen).registries;
            let only: UnknownValue = Arc::new("acme.OnlyOffscreen");
            registries.effects = Arc::new(with_kind_map_entry(
                &registries.effects,
                "acme.OnlyOffscreen".to_string(),
                WgpuEffectRegistration {
                    is_resolvable: None,
                    runner: acme_effect_runner,
                },
            ));
            registries.modifier_snippets = Arc::new(with_kind_map_entry(
                &registries.modifier_snippets,
                "acme.OnlyOffscreen".to_string(),
                only.clone(),
            ));
            registries.velocity_writers = Arc::new(with_kind_map_entry(
                &registries.velocity_writers,
                "acme.OnlyOffscreen".to_string(),
                only,
            ));
            registries.custom_material_shaders = Arc::new(with_kind_map_entry(
                &registries.custom_material_shaders,
                "acme.OnlyOffscreen".to_string(),
                "// wgsl".to_string(),
            ));
        }
        let screen_registries = &get_wgpu_render_state_runtime(&screen).registries;
        assert!(
            !screen
                .render_registries()
                .node_renderers
                .entries
                .contains_key("acme.OnlyOffscreen")
        );
        assert_eq!(quad_marker(&screen, "acme.OnlyOffscreen"), None);
        assert!(
            screen_registries
                .texture_resolvers
                .entries
                .contains_key("acme.Texture")
        );
        assert!(get_padding_resolver(&screen, "acme.OnlyOffscreen").is_none());
        assert!(
            !screen_registries
                .effects
                .entries
                .contains_key("acme.OnlyOffscreen")
        );
        assert!(
            !screen_registries
                .modifier_snippets
                .entries
                .contains_key("acme.OnlyOffscreen")
        );
        assert!(
            !screen_registries
                .velocity_writers
                .entries
                .contains_key("acme.OnlyOffscreen")
        );
        assert!(
            !screen_registries
                .custom_material_shaders
                .entries
                .contains_key("acme.OnlyOffscreen")
        );
    }

    // Proxy trees are caller-owned stores in Rust; the observable independence is that preparing the
    // derived state advances only its own traversal frame.
    #[test]
    fn owns_an_independent_encoder_and_proxy_tree() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let mut offscreen = derive_offscreen(&screen);
        let root = create_test_node("test.Root");
        register_node_renderer(&mut offscreen, "test.Root".to_string(), &DATA_NODE_RENDERER);
        let mut offscreen_proxies = proxies();
        prepare_scene_2d_render(&mut offscreen, &mut offscreen_proxies, &root);
        begin_wgpu_frame(&mut screen);
        let screen_encoder = encoder_identity(&screen);

        assert_eq!(get_render_state_runtime(&screen).current_frame_id, 0);
        assert_eq!(get_render_state_runtime(&offscreen).current_frame_id, 1);
        assert_eq!(offscreen_proxies.by_uid.len(), 1);
        with_wgpu_frame_borrow(&mut screen, &mut offscreen, |borrower| {
            assert_eq!(encoder_identity(borrower), screen_encoder);
        });
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .command_encoder
                .is_none()
        );
        assert_eq!(encoder_identity(&screen), screen_encoder);
    }

    // The source spies on `queue.writeBuffer`/`queue.submit`: the recorded writes are exactly the
    // borrower's ring span from offset 0, never the owner's ring, and nothing is submitted.
    #[test]
    fn borrows_only_the_live_frame_while_retaining_its_own_uniform_ring_and_presentation_extent() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let mut offscreen = derive_offscreen(&screen);
        let screen_offset = get_wgpu_render_state_runtime(&screen).uniform_offset;
        begin_wgpu_frame(&mut screen);
        let encoder = encoder_identity(&screen);
        let device = native(&screen);
        let records = record_test_commands(&device);
        let scope = device
            .device
            .push_error_scope(wgpu::ErrorFilter::Validation);

        with_wgpu_frame_borrow(&mut screen, &mut offscreen, |borrower| {
            assert_eq!(encoder_identity(borrower), encoder);
            let runtime = get_wgpu_render_state_runtime_mut(borrower);
            runtime.uniform_offset = runtime.uniform_stride;
        });

        assert!(block_on(scope.pop()).is_none());
        assert_eq!(encoder_identity(&screen), encoder);
        assert!(
            get_wgpu_render_state_runtime(&screen)
                .command_encoder
                .is_some()
        );
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .command_encoder
                .is_none()
        );
        assert_eq!(
            get_wgpu_render_state_runtime(&screen).uniform_offset,
            screen_offset
        );
        assert!(!is_test_buffer_destroyed(
            &device,
            &get_wgpu_render_state_runtime(&offscreen).uniform_buffer
        ));
        // The borrower's own ring receives its used span from offset 0; the owner's ring is untouched.
        let offscreen_runtime = get_wgpu_render_state_runtime(&offscreen);
        let writes: Vec<WgpuBufferWriteRecord> = records
            .lock()
            .unwrap()
            .iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::WriteBuffer(write) => Some(write.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].buffer, offscreen_runtime.uniform_buffer);
        assert_eq!(writes[0].offset, 0);
        assert_eq!(
            writes[0].data.len(),
            offscreen_runtime.uniform_stride as usize
        );
        assert!(
            writes
                .iter()
                .all(|write| write.buffer != get_wgpu_render_state_runtime(&screen).uniform_buffer)
        );
        // The borrow joined the owner's open frame, so nothing was submitted.
        assert!(
            !records
                .lock()
                .unwrap()
                .iter()
                .any(|record| matches!(record, WgpuCommandRecord::Submit(_)))
        );
    }

    // The standalone frame the borrow opened is submitted exactly once even though the callback
    // panicked, and neither state keeps an encoder.
    #[test]
    fn submits_a_standalone_borrow_and_restores_both_states_when_the_callback_throws() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let mut offscreen = derive_offscreen(&screen);
        let records = record_test_commands(&native(&screen));

        let result = catch_unwind(AssertUnwindSafe(|| {
            with_wgpu_frame_borrow(&mut screen, &mut offscreen, |_| {
                panic!("bake failed");
            });
        }));

        assert!(panic_message(result.unwrap_err()).contains("bake failed"));
        let submits = records
            .lock()
            .unwrap()
            .iter()
            .filter(|record| matches!(record, WgpuCommandRecord::Submit(_)))
            .count();
        assert_eq!(submits, 1);
        assert!(
            get_wgpu_render_state_runtime(&screen)
                .command_encoder
                .is_none()
        );
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .command_encoder
                .is_none()
        );
    }

    // The screen is exclusively borrowed inside the callback, so the nested borrow is attempted
    // through a second state on the same device; the borrower check is what rejects it.
    #[test]
    fn rejects_nested_borrowing_by_the_same_offscreen_state() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let mut offscreen = derive_offscreen(&screen);
        let mut other_owner = derive_offscreen(&screen);

        with_wgpu_frame_borrow(&mut screen, &mut offscreen, |borrower| {
            let result = catch_unwind(AssertUnwindSafe(|| {
                with_wgpu_frame_borrow(&mut other_owner, borrower, |_| {});
            }));
            assert!(panic_message(result.unwrap_err()).contains("already has an active frame"));
        });
    }

    // The source spies on each ring's `destroy`; a destroyed buffer is observed through real
    // validation (a write to it is rejected).
    #[test]
    fn destroys_derived_renderer_data_and_its_own_uniform_ring_without_freeing_the_screen_ring() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let root = create_test_node("test.DestroyRoot");
        register_node_renderer(
            &mut screen,
            "test.DestroyRoot".to_string(),
            &DESTROYING_NODE_RENDERER,
        );
        let mut offscreen = derive_offscreen(&screen);
        let mut offscreen_proxies = proxies();
        prepare_scene_2d_render(&mut offscreen, &mut offscreen_proxies, &root);
        let device = native(&screen);
        let before = DESTROY_DATA_CALLS.load(Ordering::SeqCst);

        destroy_wgpu_render_state(&mut offscreen, &mut offscreen_proxies);

        assert_eq!(DESTROY_DATA_CALLS.load(Ordering::SeqCst) - before, 1);
        assert!(is_test_buffer_destroyed(
            &device,
            &get_wgpu_render_state_runtime(&offscreen).uniform_buffer
        ));
        assert!(!is_test_buffer_destroyed(
            &device,
            &get_wgpu_render_state_runtime(&screen).uniform_buffer
        ));
    }

    #[test]
    fn requires_an_explicit_new_pipeline_for_renderers_and_padding_registered_after_derivation() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let offscreen = derive_offscreen(&screen);
        register_node_renderer(
            &mut screen,
            "acme.LateNode".to_string(),
            &LATE_NODE_RENDERER,
        );
        register_padding_resolver(&mut screen, "acme.LateEffect", padding_two);

        assert!(
            !offscreen
                .render_registries()
                .node_renderers
                .entries
                .contains_key("acme.LateNode")
        );
        assert!(get_padding_resolver(&offscreen, "acme.LateEffect").is_none());

        let refreshed = derive_offscreen(&screen);
        assert!(is_node_renderer(
            &refreshed,
            "acme.LateNode",
            &LATE_NODE_RENDERER
        ));
        assert!(
            get_padding_resolver(&refreshed, "acme.LateEffect").is_some_and(|resolver| {
                let expected: EffectPaddingResolver = padding_two;
                return std::ptr::fn_addr_eq(resolver, expected);
            })
        );
    }

    #[test]
    fn captures_late_wgpu_registrations_only_when_an_explicit_pipeline_is_created() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let decoder: WgpuCompressedTextureDecoder =
            Arc::new(|_format, _width, _height, _data: &[u8]| Some(vec![0; 4]));
        register_wgpu_compressed_texture_decoder(&mut screen, Some(decoder.clone()));
        register_wgpu_compressed_texture_upload(&mut screen, true);
        register_wgpu_quad_material_renderer(
            &mut screen,
            "acme.LateMaterial".to_string(),
            quad_renderer(1),
        );
        register_wgpu_texture_resolver(
            &mut screen,
            "acme.LateTexture".to_string(),
            Some(null_texture_resolver),
        );
        let mut offscreen = derive_offscreen(&screen);

        assert_eq!(quad_marker(&offscreen, "acme.LateMaterial"), Some(1));
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .registries
                .texture_resolvers
                .entries
                .get("acme.LateTexture")
                .is_some_and(|resolver| {
                    let expected: WgpuTextureResolver = null_texture_resolver;
                    return std::ptr::fn_addr_eq(*resolver, expected);
                })
        );
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .registries
                .compressed_texture_decoder
                .as_ref()
                .is_some_and(|value| Arc::ptr_eq(value, &decoder))
        );
        let screen_upload = get_wgpu_render_state_runtime(&screen)
            .registries
            .compressed_texture_upload
            .unwrap();
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .registries
                .compressed_texture_upload
                .is_some_and(|upload| std::ptr::fn_addr_eq(upload, screen_upload))
        );

        register_wgpu_quad_material_renderer(
            &mut offscreen,
            "acme.LateMaterial".to_string(),
            quad_renderer(2),
        );
        register_wgpu_compressed_texture_decoder(&mut offscreen, None);
        register_wgpu_compressed_texture_upload(&mut offscreen, false);
        register_wgpu_texture_resolver(&mut offscreen, "acme.LateTexture".to_string(), None);

        assert_eq!(quad_marker(&offscreen, "acme.LateMaterial"), Some(2));
        assert_eq!(quad_marker(&screen, "acme.LateMaterial"), Some(1));
        let offscreen_registries = &get_wgpu_render_state_runtime(&offscreen).registries;
        let screen_registries = &get_wgpu_render_state_runtime(&screen).registries;
        assert!(
            !offscreen_registries
                .texture_resolvers
                .entries
                .contains_key("acme.LateTexture")
        );
        assert!(
            screen_registries
                .texture_resolvers
                .entries
                .contains_key("acme.LateTexture")
        );
        assert!(offscreen_registries.compressed_texture_decoder.is_none());
        assert!(screen_registries.compressed_texture_decoder.is_some());
        assert!(offscreen_registries.compressed_texture_upload.is_none());
        assert!(screen_registries.compressed_texture_upload.is_some());
    }

    #[test]
    fn reports_a_lost_device_instead_of_deriving() {
        let screen = create_wgpu_render_state_for_test(None);
        lose_device(&screen);

        match create_wgpu_offscreen_render_state(&screen) {
            WgpuOffscreenRenderStateResult::DeviceLost(lost) => {
                assert_eq!(lost.info.reason, WgpuDeviceLostReason::Destroyed);
            }
            WgpuOffscreenRenderStateResult::Ok(_) => panic!("a lost device must not derive"),
        }
    }
}

mod create_wgpu_offscreen_render_state_from_device_state {
    use super::*;

    #[test]
    fn builds_a_state_on_the_given_device_tier_with_the_requested_options() {
        let screen = create_wgpu_render_state_for_test(None);
        let state = create_wgpu_offscreen_render_state_from_device_state(
            &screen.device_state,
            Some(&WgpuRenderStateOptions {
                format: Some(wgpu::TextureFormat::Rgba8Unorm),
                image_smoothing_enabled: Some(false),
                ..test_default()
            }),
        );

        assert!(Arc::ptr_eq(
            &get_wgpu_render_state_runtime(&state).context,
            &get_wgpu_render_state_runtime(&screen).context
        ));
        assert_eq!(state.format, wgpu::TextureFormat::Rgba8Unorm);
        assert!(!state.render_state().allow_smoothing);
        assert_eq!(
            get_wgpu_render_state_runtime(&screen)
                .context
                .read()
                .unwrap()
                .references,
            2
        );
    }

    #[test]
    fn defaults_the_format_to_bgra8unorm() {
        let device_state = create_wgpu_device_state(&create_test_device());
        let state = create_wgpu_offscreen_render_state_from_device_state(&device_state, None);
        assert_eq!(state.format, wgpu::TextureFormat::Bgra8Unorm);
    }
}

mod create_wgpu_render_state {
    use super::*;

    // The state is "how to talk to the GPU" and the screen target is "which surface a frame lands on".
    // Keeping them apart is what lets one state render to several windows, and lets an offscreen state
    // exist without inventing a canvas for it. (The Rust state has no context or surface field at all.)
    #[test]
    fn takes_the_device_alone_no_surface_no_context_nothing_that_belongs_to_a_screen() {
        let (host, record) = create_test_wgpu_host();
        let surface = create_test_wgpu_surface(&create_test_canvas(800, 600));
        let acquisition = block_on(create_wgpu_acquisition(&host, &surface, None)).unwrap();
        let format = get_wgpu_texture_format(&acquisition.format);
        let mut state = create_wgpu_render_state(
            &acquisition.device,
            Some(&WgpuRenderStateOptions {
                format,
                ..test_default()
            }),
        );

        assert!(Arc::ptr_eq(
            &state.device.handle,
            &acquisition.device.handle
        ));
        assert_eq!(Some(state.format), format);

        destroy_wgpu_render_state(&mut state, &mut proxies());
        release_wgpu_acquisition(&host, &acquisition);
        assert_eq!(record.release_count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn sets_allow_smoothing_to_true_by_default() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(state.render_state().allow_smoothing);
    }

    #[test]
    fn initialises_uniform_ring_buffer() {
        let state = create_wgpu_render_state_for_test(None);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(
            runtime.uniform_buffer.size(),
            runtime.uniform_stride as u64 * 4096
        );
        assert_eq!(
            runtime.uniform_data.len() as u64 * 4,
            runtime.uniform_buffer.size()
        );
        assert_eq!(runtime.uniform_offset, 0);
    }

    // Node renderers are not WGPU options in Rust, so the preset carries the WGPU material table; a
    // registration on the state leaves the caller's preset untouched.
    #[test]
    fn does_not_mutate_a_frozen_preset_when_used_as_options_input() {
        let preset = WgpuRenderStateOptions {
            material_renderers: Some(empty_map()),
            ..test_default()
        };
        let mut state = create_wgpu_render_state_for_test(Some(preset.clone()));
        register_wgpu_quad_material_renderer(&mut state, "acme.Test".to_string(), quad_renderer(1));
        register_node_renderer(&mut state, "acme.Test".to_string(), &NODE_RENDERER);

        assert!(
            preset
                .material_renderers
                .as_ref()
                .unwrap()
                .entries
                .is_empty()
        );
        assert_eq!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .material_renderers
                .entries
                .len(),
            1
        );
        assert_eq!(state.render_registries().node_renderers.entries.len(), 1);
    }

    // The registries struct has no revision field (a compile-time fact); the counter lives on the
    // runtime.
    #[test]
    fn keeps_revision_counters_on_the_runtime_not_in_registries() {
        let state = create_wgpu_render_state_for_test(None);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert_eq!(runtime.modifier_snippet_revision, 0);
        assert!(runtime.registries.modifier_snippets.entries.is_empty());
    }

    #[test]
    fn starts_with_no_open_frame_pass_or_target() {
        let state = create_wgpu_render_state_for_test(None);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(runtime.render_pass.is_none());
        assert!(runtime.command_encoder.is_none());
        assert!(runtime.pass_stack.is_empty());
        assert!(runtime.current_render_target.is_none());
    }
}

mod create_wgpu_render_state_runtime {
    use super::*;

    // The source's base `binding` slot and backend-neutral `colorAdjustments`/`strokeTessellator` are
    // not part of the Rust WGPU runtime; every WGPU registration table starts empty.
    #[test]
    fn returns_a_runtime_with_the_base_binding_slot_and_empty_named_registration_tables() {
        let runtime = create_wgpu_render_state_runtime(
            &create_wgpu_device_state(&create_test_device()),
            None,
        );
        assert!(
            runtime
                .registries
                .custom_material_shaders
                .entries
                .is_empty()
        );
        assert!(runtime.registries.material_renderers.entries.is_empty());
        assert!(runtime.registries.modifier_snippets.entries.is_empty());
        assert_eq!(runtime.modifier_snippet_revision, 0);
        assert!(runtime.registries.effects.entries.is_empty());
        assert!(runtime.registries.compressed_texture_decoder.is_none());
        assert!(runtime.registries.compressed_texture_upload.is_none());
        assert!(runtime.registries.shape_rasterizer.is_none());
        assert!(runtime.registries.velocity_writers.entries.is_empty());
    }

    #[test]
    fn shares_the_device_tier_when_two_runtimes_are_built_from_the_same_wgpu_device_state() {
        let device_state = create_wgpu_device_state(&create_test_device());
        let runtime_a = create_wgpu_render_state_runtime(&device_state, None);
        let runtime_b = create_wgpu_render_state_runtime(&device_state, None);

        let native = runtime_a.context.read().unwrap().native.clone();
        let layouts = create_wgpu_bind_group_layouts(&native);
        let resources = WgpuDeviceRuntimeResources {
            linear_sampler: native.device.create_sampler(&test_default()),
            nearest_sampler: native.device.create_sampler(&test_default()),
            texture_bind_group_layout: layouts.texture_bind_group_layout,
            uniform_bind_group_layout: layouts.uniform_bind_group_layout,
        };
        runtime_a.context.write().unwrap().resources = Some(resources.clone());
        assert_eq!(
            runtime_b
                .context
                .read()
                .unwrap()
                .resources
                .as_ref()
                .map(|value| value.linear_sampler.clone()),
            Some(resources.linear_sampler)
        );
    }

    #[test]
    fn keeps_separate_device_tiers_when_two_runtimes_are_built_from_different_wgpu_device_states() {
        let runtime_a = create_wgpu_render_state_runtime(
            &create_wgpu_device_state(&create_test_device()),
            None,
        );
        let runtime_b = create_wgpu_render_state_runtime(
            &create_wgpu_device_state(&create_test_device()),
            None,
        );

        assert!(!Arc::ptr_eq(&runtime_a.context, &runtime_b.context));
    }
}

mod destroy_wgpu_render_state {
    use super::*;

    // The source spies on `device.destroy`; a destroyed device would record a loss and refuse work, so
    // the device is observed to stay live and usable.
    #[test]
    fn never_destroys_the_device_however_many_of_its_states_are_torn_down() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut offscreen = derive_offscreen(&state);
        let device = native(&state);

        destroy_wgpu_render_state(&mut state, &mut proxies());
        destroy_wgpu_render_state(&mut state, &mut proxies());
        destroy_wgpu_render_state(&mut offscreen, &mut proxies());
        destroy_wgpu_render_state(&mut offscreen, &mut proxies());
        let _ = device.device.poll(wgpu::PollType::Poll);

        assert!(!is_wgpu_device_lost(&state));
        assert!(is_test_device_usable(&device));
    }

    // The source spies on `uniformBuffer.destroy`; destruction is observed through real validation.
    #[test]
    fn destroys_the_state_owned_uniform_buffer() {
        let mut state = create_wgpu_render_state_for_test(None);
        let device = native(&state);
        assert!(!is_test_buffer_destroyed(
            &device,
            &get_wgpu_render_state_runtime(&state).uniform_buffer
        ));

        destroy_wgpu_render_state(&mut state, &mut proxies());

        assert!(is_test_buffer_destroyed(
            &device,
            &get_wgpu_render_state_runtime(&state).uniform_buffer
        ));
    }

    #[test]
    fn runs_state_owned_teardown_callbacks_exactly_once() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (teardown, calls) = recording_state_teardown();
        register_wgpu_render_state_teardown(&mut state, teardown);

        destroy_wgpu_render_state(&mut state, &mut proxies());
        destroy_wgpu_render_state(&mut state, &mut proxies());

        assert_eq!(*calls.lock().unwrap(), vec![get_entity_id(&state)]);
    }

    #[test]
    fn does_not_throw_on_a_fresh_state_with_no_lazily_created_buffers() {
        let mut state = create_wgpu_render_state_for_test(None);
        let result = catch_unwind(AssertUnwindSafe(|| {
            destroy_wgpu_render_state(&mut state, &mut proxies());
        }));
        assert!(result.is_ok());
        assert!(get_wgpu_render_state_runtime(&state).destroyed);
    }

    #[test]
    fn shares_the_device_tier_across_screen_and_offscreen_states() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut offscreen = derive_offscreen(&state);

        let resources = get_wgpu_render_state_runtime(&state)
            .context
            .read()
            .unwrap()
            .resources
            .clone()
            .expect("the screen state initialized device resources");
        assert_eq!(
            get_wgpu_render_state_runtime(&offscreen)
                .context
                .read()
                .unwrap()
                .resources
                .as_ref()
                .map(|value| value.uniform_bind_group_layout.clone()),
            Some(resources.uniform_bind_group_layout)
        );

        destroy_wgpu_render_state(&mut offscreen, &mut proxies());
        destroy_wgpu_render_state(&mut state, &mut proxies());
        assert_eq!(
            get_wgpu_render_state_runtime(&state)
                .context
                .read()
                .unwrap()
                .references,
            0
        );
    }

    #[test]
    fn invokes_registered_teardown_callbacks_when_the_last_reference_is_destroyed() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut offscreen = derive_offscreen(&state);
        let (teardown, calls) = recording_device_teardown();
        register_wgpu_device_teardown(&state, teardown);

        destroy_wgpu_render_state(&mut state, &mut proxies());
        assert!(calls.lock().unwrap().is_empty());

        destroy_wgpu_render_state(&mut offscreen, &mut proxies());
        assert_eq!(*calls.lock().unwrap(), vec![native(&state).device]);
    }

    #[test]
    fn does_not_invoke_teardowns_when_references_remain() {
        let mut state = create_wgpu_render_state_for_test(None);
        let _offscreen = derive_offscreen(&state);
        let (teardown, calls) = recording_device_teardown();
        register_wgpu_device_teardown(&state, teardown);

        destroy_wgpu_render_state(&mut state, &mut proxies());
        assert!(calls.lock().unwrap().is_empty());
    }
}

mod get_wgpu_color_adjustment_material_feature {
    use super::*;

    #[test]
    fn resolves_only_a_bound_feature_entry() {
        let mut state = create_wgpu_render_state_for_test(None);
        let feature: UnknownValue = Arc::new("acme.ColorFeature");

        assert!(get_wgpu_color_adjustment_material_feature(&state).is_none());
        get_wgpu_render_state_runtime_mut(&mut state)
            .registries
            .color_adjustment_feature = Some(feature.clone());
        assert!(
            get_wgpu_color_adjustment_material_feature(&state)
                .is_some_and(|value| Arc::ptr_eq(&value, &feature))
        );
        get_wgpu_render_state_runtime_mut(&mut state)
            .registries
            .color_adjustment_feature = None;
        assert!(get_wgpu_color_adjustment_material_feature(&state).is_none());
    }
}

mod get_wgpu_color_adjustment_material_feature_guard {
    use super::*;

    #[test]
    fn resolves_only_a_bound_guard_entry() {
        let mut state = create_wgpu_render_state_for_test(None);
        let guard: UnknownValue = Arc::new("acme.ColorFeatureGuard");

        assert!(get_wgpu_color_adjustment_material_feature_guard(&state).is_none());
        get_wgpu_render_state_runtime_mut(&mut state)
            .registries
            .color_adjustment_feature_guard = Some(guard.clone());
        assert!(
            get_wgpu_color_adjustment_material_feature_guard(&state)
                .is_some_and(|value| Arc::ptr_eq(&value, &guard))
        );
        get_wgpu_render_state_runtime_mut(&mut state)
            .registries
            .color_adjustment_feature_guard = None;
        assert!(get_wgpu_color_adjustment_material_feature_guard(&state).is_none());
    }
}

mod get_wgpu_device_runtime {
    use super::*;

    #[test]
    fn returns_the_device_runtime_attached_by_create_wgpu_device_state() {
        let native_device = create_test_native_device();
        let device = create_test_wgpu_device(native_device.clone());
        let device_state = create_wgpu_device_state(&device);
        let runtime = get_wgpu_device_runtime(&device_state);
        assert_eq!(runtime.read().unwrap().native.device, native_device.device);
        assert!(runtime.read().unwrap().teardowns.is_empty());
    }

    #[test]
    fn resolves_the_same_runtime_object_on_repeated_calls() {
        let device_state = create_wgpu_device_state(&create_test_device());
        assert!(Arc::ptr_eq(
            &get_wgpu_device_runtime(&device_state),
            &get_wgpu_device_runtime(&device_state)
        ));
    }
}

mod get_wgpu_render_state_device_resources {
    use super::*;

    #[test]
    fn returns_the_initialized_device_native_resource_block_without_placeholders() {
        let mut state = create_wgpu_render_state_for_test(None);
        let resources = get_wgpu_render_state_device_resources(&state);
        let again = get_wgpu_render_state_device_resources(&state);

        assert_eq!(again.linear_sampler, resources.linear_sampler);
        assert_eq!(again.nearest_sampler, resources.nearest_sampler);
        assert_eq!(
            again.texture_bind_group_layout,
            resources.texture_bind_group_layout
        );
        assert_eq!(
            again.uniform_bind_group_layout,
            resources.uniform_bind_group_layout
        );
        assert_ne!(resources.linear_sampler, resources.nearest_sampler);

        destroy_wgpu_render_state(&mut state, &mut proxies());
    }
}

mod get_wgpu_render_state_native_device {
    use super::*;

    #[test]
    fn returns_the_native_device_the_state_handle_carries() {
        let state = create_wgpu_render_state_for_test(None);
        let carried = state
            .device
            .handle
            .downcast_ref::<WgpuNativeDevice>()
            .unwrap()
            .clone();
        let device = get_wgpu_render_state_native_device(&state);
        assert_eq!(device.device, carried.device);
        assert_eq!(device.queue, carried.queue);
    }
}

mod get_wgpu_render_state_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_attached_by_create_wgpu_render_state() {
        let state = create_wgpu_render_state_for_test(None);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(runtime.uniform_buffer.size() > 0);
        assert!(!runtime.destroyed);
    }

    #[test]
    fn resolves_the_same_runtime_object_on_repeated_calls() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(std::ptr::eq(
            get_wgpu_render_state_runtime(&state),
            get_wgpu_render_state_runtime(&state)
        ));
    }
}

mod get_wgpu_render_state_runtime_mut {
    use super::*;

    #[test]
    fn exposes_the_same_runtime_for_writes_seen_by_the_shared_accessor() {
        let mut state = create_wgpu_render_state_for_test(None);
        let stride = get_wgpu_render_state_runtime(&state).uniform_stride;
        get_wgpu_render_state_runtime_mut(&mut state).uniform_offset = stride;
        assert_eq!(get_wgpu_render_state_runtime(&state).uniform_offset, stride);
    }
}

mod get_wgpu_sampler {
    use super::*;

    use wgpu::FilterMode::{Linear, Nearest};

    fn sampler_cache_len(state: &WgpuRenderState) -> usize {
        return get_wgpu_render_state_runtime(state)
            .context
            .read()
            .unwrap()
            .sampler_cache
            .len();
    }

    #[test]
    fn caches_a_sampler_per_filter_wrap_mip_anisotropy_config_and_reuses_it_one_create_sampler() {
        let state = create_wgpu_render_state_for_test(None);
        let a = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::Repeat,
            TextureWrap::Repeat,
            None,
            None,
        );
        let b = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::Repeat,
            TextureWrap::Repeat,
            None,
            None,
        );
        assert_eq!(a, b);
        // The cache is keyed by a packed number (no per-call allocation), and one config caches once.
        assert_eq!(sampler_cache_len(&state), 1);
    }

    #[test]
    fn returns_a_distinct_sampler_for_a_different_wrap_or_filter() {
        let state = create_wgpu_render_state_for_test(None);
        let repeat = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::Repeat,
            TextureWrap::Repeat,
            None,
            None,
        );
        let clamp = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::ClampToEdge,
            TextureWrap::ClampToEdge,
            None,
            None,
        );
        let nearest = get_wgpu_sampler(
            &state,
            Nearest,
            Nearest,
            TextureWrap::Repeat,
            TextureWrap::Repeat,
            None,
            None,
        );
        assert_ne!(repeat, clamp);
        assert_ne!(repeat, nearest);
    }

    #[test]
    fn keys_the_mip_filter_separately_so_a_trilinear_sampler_differs_from_a_non_mip_one() {
        let state = create_wgpu_render_state_for_test(None);
        let no_mip = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::Repeat,
            TextureWrap::Repeat,
            None,
            None,
        );
        let trilinear = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::Repeat,
            TextureWrap::Repeat,
            Some(wgpu::MipmapFilterMode::Linear),
            None,
        );
        assert_ne!(no_mip, trilinear);
        assert_eq!(sampler_cache_len(&state), 2);
    }

    // WebGPU rejects anisotropy > 1 unless min/mag/mip are all linear, so a nearest+aniso request
    // collapses to the SAME sampler as the explicit linear/trilinear anisotropic request.
    #[test]
    fn forces_linear_filtering_and_a_linear_mip_filter_when_anisotropy_exceeds_1() {
        let state = create_wgpu_render_state_for_test(None);
        let device = native(&state);
        let scope = device
            .device
            .push_error_scope(wgpu::ErrorFilter::Validation);
        let collapsed = get_wgpu_sampler(
            &state,
            Nearest,
            Nearest,
            TextureWrap::ClampToEdge,
            TextureWrap::ClampToEdge,
            None,
            Some(8.0),
        );
        let explicit = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::ClampToEdge,
            TextureWrap::ClampToEdge,
            Some(wgpu::MipmapFilterMode::Linear),
            Some(8.0),
        );
        assert!(block_on(scope.pop()).is_none());
        assert_eq!(collapsed, explicit);
    }

    #[test]
    fn floors_and_clamps_the_anisotropy_level_into_the_cache_key() {
        let state = create_wgpu_render_state_for_test(None);
        let a = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::Repeat,
            TextureWrap::Repeat,
            Some(wgpu::MipmapFilterMode::Linear),
            Some(4.9),
        );
        let b = get_wgpu_sampler(
            &state,
            Linear,
            Linear,
            TextureWrap::Repeat,
            TextureWrap::Repeat,
            Some(wgpu::MipmapFilterMode::Linear),
            Some(4.0),
        );
        assert_eq!(a, b);
        assert_eq!(sampler_cache_len(&state), 1);
    }

    // The source inspects the `createSampler` descriptor; a native sampler cannot report its filters,
    // so independence is observed as one distinct cached sampler per (min, mag) pairing.
    #[test]
    fn keeps_independent_minification_and_magnification_filters() {
        let state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&native(&state));
        let mut samplers = Vec::new();
        for (min, mag) in [
            (Nearest, Linear),
            (Linear, Nearest),
            (Nearest, Nearest),
            (Linear, Linear),
        ] {
            samplers.push(get_wgpu_sampler(
                &state,
                min,
                mag,
                TextureWrap::Repeat,
                TextureWrap::Repeat,
                None,
                None,
            ));
        }
        assert_eq!(sampler_cache_len(&state), 4);
        for (index, sampler) in samplers.iter().enumerate() {
            for other in &samplers[index + 1..] {
                assert_ne!(sampler, other);
            }
        }
        // The source's createSampler spy: each descriptor keeps its own min and mag filter.
        let created: Vec<(wgpu::FilterMode, wgpu::FilterMode, wgpu::Sampler)> = records
            .lock()
            .unwrap()
            .iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::CreateSampler(created) => Some((
                    created.min_filter,
                    created.mag_filter,
                    created.sampler.clone(),
                )),
                _ => None,
            })
            .collect();
        let expected = [
            (wgpu::FilterMode::Nearest, wgpu::FilterMode::Linear),
            (wgpu::FilterMode::Linear, wgpu::FilterMode::Nearest),
            (wgpu::FilterMode::Nearest, wgpu::FilterMode::Nearest),
            (wgpu::FilterMode::Linear, wgpu::FilterMode::Linear),
        ];
        assert_eq!(created.len(), 4);
        for (index, (min, mag, sampler)) in created.iter().enumerate() {
            assert_eq!((*min, *mag), expected[index]);
            assert_eq!(*sampler, samplers[index]);
        }
    }
}

mod initialize_wgpu_device_state {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_device_state() {
        let first = create_test_device();
        let second = create_test_device();
        let mut out = create_wgpu_device_state(&first);
        assert!(Arc::ptr_eq(&out.device.handle, &first.handle));

        initialize_wgpu_device_state(&mut out, &second);

        assert!(Arc::ptr_eq(&out.device.handle, &second.handle));
    }
}

mod initialize_wgpu_host_acquisition {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_host_acquisition() {
        let (host, _) = create_test_wgpu_host();
        let surface = create_test_wgpu_surface(&create_test_canvas(320, 200));
        let acquired = block_on((host.acquire)(&surface, &test_default())).unwrap();
        let device = acquired.device.clone();
        let mut out = flight_surface::create_wgpu_host_acquisition();

        initialize_wgpu_host_acquisition(&mut out, acquired, WgpuHostAcquisitionOwnership::Caller);

        assert!(Arc::ptr_eq(&out.device.handle, &device.handle));
        assert_eq!(out.format, "bgra8unorm");
        assert_eq!(out.ownership, WgpuHostAcquisitionOwnership::Caller);
        assert_eq!((out.surface.width)(), 320.0);
        assert_eq!((out.surface.height)(), 200.0);
        release_wgpu_acquisition(&host, &out);
    }
}

mod initialize_wgpu_offscreen_render_state_device_lost_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_offscreen_render_state_device_lost_result() {
        let screen = create_wgpu_render_state_for_test(None);
        lose_device(&screen);
        let WgpuOffscreenRenderStateResult::DeviceLost(mut out) =
            create_wgpu_offscreen_render_state(&screen)
        else {
            panic!("a lost device reports the device-lost arm");
        };
        let info = WgpuDeviceLostInfo {
            message: "gpu reset".to_string(),
            reason: WgpuDeviceLostReason::Unknown,
        };

        initialize_wgpu_offscreen_render_state_device_lost_result(&mut out, info.clone());

        assert_eq!(out.info, info);
    }
}

mod initialize_wgpu_offscreen_render_state_ok_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_offscreen_render_state_ok_result() {
        let screen = create_wgpu_render_state_for_test(None);
        let WgpuOffscreenRenderStateResult::Ok(mut out) =
            create_wgpu_offscreen_render_state(&screen)
        else {
            panic!("a live device derives a state");
        };
        let replacement = create_wgpu_render_state_for_test(None);
        let replacement_id = get_entity_id(&replacement);

        initialize_wgpu_offscreen_render_state_ok_result(&mut out, replacement);

        assert_eq!(get_entity_id(&out.state), replacement_id);
    }
}

mod is_wgpu_supported {
    use super::*;

    #[test]
    fn returns_true_when_navigator_gpu_is_present() {
        let (host, _) = create_test_wgpu_host();
        assert!(is_wgpu_supported(&host));
    }

    // The source makes the browser's `navigator.gpu` getter throw; the test host's support probe is
    // switched off instead.
    #[test]
    fn returns_false_when_navigator_gpu_throws() {
        let (host, record) = create_test_wgpu_host();
        record.supported.store(false, Ordering::SeqCst);
        assert!(!is_wgpu_supported(&host));
    }
}

mod register_wgpu_device_teardown {
    use super::*;

    #[test]
    fn pushes_a_callback_that_fires_on_device_teardown() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (teardown, calls) = recording_device_teardown();
        register_wgpu_device_teardown(&state, teardown);
        destroy_wgpu_render_state(&mut state, &mut proxies());
        assert_eq!(*calls.lock().unwrap(), vec![native(&state).device]);
    }
}

mod register_wgpu_render_state_teardown {
    use super::*;

    #[test]
    fn runs_a_state_owned_callback_exactly_once_on_teardown() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (teardown, calls) = recording_state_teardown();
        register_wgpu_render_state_teardown(&mut state, teardown);

        destroy_wgpu_render_state(&mut state, &mut proxies());
        destroy_wgpu_render_state(&mut state, &mut proxies());

        assert_eq!(*calls.lock().unwrap(), vec![get_entity_id(&state)]);
    }
}

mod release_wgpu_acquisition {
    use super::*;

    // Unconditional on purpose: this is the CALLER asking. Flight's own paths refuse to release
    // caller-owned handles, so if this verb deferred to the same policy the caller would have no way to
    // end their life.
    #[test]
    fn releases_caller_owned_handles_which_flight_itself_never_does() {
        let (mut host, _) = create_test_wgpu_host();
        let surface = create_test_wgpu_surface(&create_test_canvas(800, 600));
        let acquisition = block_on(create_wgpu_acquisition(&host, &surface, None)).unwrap();
        let released = Arc::new(Mutex::new(Vec::new()));
        let recorded = released.clone();
        host.release = Arc::new(move |held| {
            recorded.lock().unwrap().push(get_entity_id(held));
        });

        release_wgpu_acquisition(&host, &acquisition);

        assert_eq!(*released.lock().unwrap(), vec![get_entity_id(&acquisition)]);
    }
}

mod resolve_wgpu_apply_blend_mode {
    use super::*;

    #[test]
    fn returns_a_hook_installed_directly_on_the_state() {
        let state = create_wgpu_render_state_for_test(None);
        set_hook(&state, Some(screen_hook));
        assert!(is_hook(resolve_wgpu_apply_blend_mode(&state), screen_hook));
    }
}
