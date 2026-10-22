mod build_gl_render_registries {
    use std::sync::Arc;

    use crate::gl_test_helper::make_state_options;
    use flight_render_gl::build_gl_render_registries;

    #[test]
    fn returns_all_required_fields_with_default_values() {
        let registries = build_gl_render_registries(&make_state_options());
        assert!(registries.blend_realizations.entries.is_empty());
        assert!(registries.custom_effect_shaders.entries.is_empty());
        assert!(registries.custom_material_shaders.entries.is_empty());
        assert!(registries.material_renderers.entries.is_empty());
        assert!(registries.modifier_snippets.entries.is_empty());
        assert!(registries.pbr_extensions.entries.is_empty());
        assert!(registries.texture_resolvers.entries.is_empty());
        assert!(registries.velocity_writers.entries.is_empty());
        assert!(registries.color_adjustment_feature.is_none());
        assert!(registries.color_adjustment_feature_guard.is_none());
        assert!(registries.compressed_texture_decoder.is_none());
        assert!(registries.compressed_texture_upload.is_none());
    }

    #[test]
    fn clones_provided_immutable_snapshots_into_an_isolated_live_aggregate() {
        let options = make_state_options();
        let mut registries = build_gl_render_registries(&options);
        assert!(Arc::ptr_eq(
            &registries.texture_resolvers,
            &options.gl_registries.texture_resolvers
        ));
        Arc::make_mut(&mut registries.texture_resolvers)
            .key_order
            .push("acme.Late".to_string());
        assert!(options.gl_registries.texture_resolvers.key_order.is_empty());
        assert!(!Arc::ptr_eq(
            &registries.texture_resolvers,
            &options.gl_registries.texture_resolvers
        ));
    }
}

mod create_gl_context_state {
    use std::rc::Rc;

    use flight_entity::get_entity_id;
    use flight_render_gl::create_gl_context_state;

    use crate::gl_test_helper::{calls_named, make_gl, make_state_options};

    #[test]
    fn allocates_the_shared_quad_buffers_once() {
        let context = create_gl_context_state(make_gl()).unwrap();
        let runtime = context.runtime_state.borrow();
        assert!(runtime.quad_index_buffer.is_some());
        assert!(runtime.quad_vertex_buffer.is_some());
        assert_eq!(calls_named("buffer_data"), 2);
    }

    #[test]
    fn allocates_a_distinct_owner_for_each_call_with_the_same_raw_context() {
        let gl = make_gl();
        let first = create_gl_context_state(gl.clone()).unwrap();
        let second = create_gl_context_state(gl).unwrap();
        assert!(!Rc::ptr_eq(&first, &second));
        assert_ne!(get_entity_id(&*first), get_entity_id(&*second));
    }

    #[test]
    fn shares_the_context_tier_across_render_states_derived_from_one_owner() {
        let context = create_gl_context_state(make_gl()).unwrap();
        let first = flight_render_gl::create_gl_render_state(context.clone(), None);
        let second = flight_render_gl::create_gl_render_state(context.clone(), None);
        assert!(Rc::ptr_eq(&first.context_state, &second.context_state));
        assert!(Rc::ptr_eq(&first.context_state, &context));
        assert!(!Rc::ptr_eq(&first.gl_runtime, &second.gl_runtime));
    }

    #[test]
    fn entity_identity_is_owned_by_the_context_state_not_the_raw_handle() {
        let gl = make_gl();
        let first = create_gl_context_state(gl.clone()).unwrap();
        let second = create_gl_context_state(gl).unwrap();
        assert_ne!(get_entity_id(&*first), get_entity_id(&*second));
    }

    #[test]
    fn two_context_owners_over_one_raw_handle_do_not_share_runtime_state() {
        let gl = make_gl();
        let first = create_gl_context_state(gl.clone()).unwrap();
        let second = create_gl_context_state(gl).unwrap();
        first.runtime_state.borrow_mut().max_anisotropy = 7.0;
        first
            .runtime_state
            .borrow_mut()
            .teardowns
            .push(Box::new(|_| {}));
        assert_eq!(second.runtime_state.borrow().max_anisotropy, 1.0);
        assert!(second.runtime_state.borrow().teardowns.is_empty());
    }

    #[test]
    fn render_states_from_one_explicit_owner_share_only_the_context_tier() {
        let context = create_gl_context_state(make_gl()).unwrap();
        let first =
            flight_render_gl::create_gl_render_state(context.clone(), Some(&make_state_options()));
        let second = flight_render_gl::create_gl_render_state(context, None);
        first.context_state.runtime_state.borrow_mut().binding = None;
        assert!(Rc::ptr_eq(&first.context_state, &second.context_state));
        assert!(Rc::ptr_eq(&first.gl, &second.gl));
        assert!(!Rc::ptr_eq(&first.gl_runtime, &second.gl_runtime));
    }
}

mod create_gl_render_state {
    use std::rc::Rc;
    use std::sync::Arc;

    use flight_render_gl::{
        create_gl_render_state, register_gl_blend_mode, GlBlendFactor, GlBlendRealization,
    };

    use crate::gl_test_helper::{calls_with, clear_calls, make_context_state, make_state_options};

    #[test]
    fn registers_a_generic_runtime_owner() {
        let context = make_context_state();
        let options = make_state_options();
        let state = create_gl_render_state(context.clone(), Some(&options));
        assert_ne!(flight_entity::get_entity_id(&state), 0);
        assert_eq!(context.runtime_state.borrow().references, 1);
        assert_eq!(context.runtime_state.borrow().state_runtimes.len(), 1);
    }

    #[test]
    fn stores_the_exact_gl_context_from_the_explicit_owner() {
        let context = make_context_state();
        let state = create_gl_render_state(context.clone(), None);
        assert!(Rc::ptr_eq(&state.gl, &context.gl));
        assert!(Rc::ptr_eq(&state.context_state, &context));
    }

    #[test]
    fn initializes_the_shared_blend_signature_to_none() {
        let state = create_gl_render_state(make_context_state(), None);
        assert!(state
            .context_state
            .runtime_state
            .borrow()
            .current_blend_signature
            .is_none());
    }

    #[test]
    fn initializes_the_shared_shader_binding_to_none() {
        let state = create_gl_render_state(make_context_state(), None);
        assert!(state.context_state.runtime_state.borrow().binding.is_none());
    }

    #[test]
    fn initializes_the_shared_texture_realization_to_none() {
        let state = create_gl_render_state(make_context_state(), None);
        assert!(state
            .context_state
            .runtime_state
            .borrow()
            .current_texture_realization
            .is_none());
    }

    #[test]
    fn enables_blending_during_initialization() {
        let context = make_context_state();
        clear_calls();
        create_gl_render_state(context, None);
        assert!(calls_with("enable")
            .iter()
            .any(|call| call.integers == vec![i64::from(glow::BLEND)]));
    }

    #[test]
    fn disables_depth_testing_during_initialization() {
        let context = make_context_state();
        clear_calls();
        create_gl_render_state(context, None);
        assert!(calls_with("disable")
            .iter()
            .any(|call| call.integers == vec![i64::from(glow::DEPTH_TEST)]));
    }

    #[test]
    fn sets_the_default_premultiplied_alpha_blend_function() {
        let context = make_context_state();
        clear_calls();
        create_gl_render_state(context, None);
        assert_eq!(
            calls_with("blend_func").last().unwrap().integers,
            vec![i64::from(glow::ONE), i64::from(glow::ONE_MINUS_SRC_ALPHA)]
        );
    }

    #[test]
    fn keeps_pixel_ratio_assigned_after_creation() {
        let mut state = create_gl_render_state(make_context_state(), None);
        state.render.pixel_ratio = 2.0;
        assert_eq!(state.render.pixel_ratio, 2.0);
    }

    #[test]
    fn keeps_allow_smoothing_assigned_after_creation() {
        let mut state = create_gl_render_state(make_context_state(), None);
        state.render.allow_smoothing = false;
        assert!(!state.render.allow_smoothing);
    }

    #[test]
    fn round_pixels_defaults_to_false() {
        let state = create_gl_render_state(make_context_state(), None);
        assert!(!state.render.round_pixels);
    }

    #[test]
    fn keeps_round_pixels_assigned_after_creation() {
        let mut state = create_gl_render_state(make_context_state(), None);
        state.render.round_pixels = true;
        assert!(state.render.round_pixels);
    }

    #[test]
    fn does_not_mutate_an_immutable_preset_used_as_options_input() {
        let options = make_state_options();
        let original = options.gl_registries.blend_realizations.clone();
        let mut state = create_gl_render_state(make_context_state(), Some(&options));
        register_gl_blend_mode(
            &mut state,
            "acme.Test".to_string(),
            GlBlendRealization {
                src: GlBlendFactor::One,
                dst: GlBlendFactor::Zero,
                equation: None,
            },
        );
        assert!(options.gl_registries.blend_realizations.entries.is_empty());
        assert!(Arc::ptr_eq(
            &original,
            &options.gl_registries.blend_realizations
        ));
        assert!(state
            .gl_registries
            .blend_realizations
            .entries
            .contains_key("acme.Test"));
    }

    #[test]
    fn keeps_registration_counters_and_snapshots_out_of_the_options_record() {
        let options = make_state_options();
        let state = create_gl_render_state(make_context_state(), Some(&options));
        assert_eq!(state.runtime.renderer_map_id, 0);
        assert!(state.gl_registries.modifier_snippets.entries.is_empty());
        assert!(state.gl_registries.pbr_extensions.entries.is_empty());
        assert!(options.gl_registries.modifier_snippets.entries.is_empty());
        assert!(options.gl_registries.pbr_extensions.entries.is_empty());
    }

    #[test]
    fn two_states_from_one_owner_share_the_context_tier() {
        let context = make_context_state();
        let first = create_gl_render_state(context.clone(), None);
        let second = create_gl_render_state(context, None);
        first
            .context_state
            .runtime_state
            .borrow_mut()
            .current_blend_signature = Some(flight_render_gl::GlBlendSignature {
            dst: 1,
            equation: 2,
            src: 3,
        });
        assert_eq!(
            second
                .context_state
                .runtime_state
                .borrow()
                .current_blend_signature,
            Some(flight_render_gl::GlBlendSignature {
                dst: 1,
                equation: 2,
                src: 3,
            })
        );
    }
}

mod create_gl_render_state_context_sharing {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, RwLock};

    use flight_node::{Node, NodeRef, RendererDataFields, RendererDataRef};
    use flight_render::{
        prepare_scene_2d_render, register_node_renderer, NodeRenderer, RenderProxy2D,
    };
    use flight_render_gl::{
        create_gl_render_state, destroy_gl_render_state, register_gl_blend_mode,
        register_gl_texture_resolver, GlBlendFactor, GlBlendRealization, GlRenderState,
        GlTextureRealization,
    };
    use flight_texture::{TextureColorSpace, TextureVariant};

    use crate::gl_test_helper::{
        calls_named, clear_calls, make_context_state, make_proxies, make_state_options,
    };

    #[derive(Default)]
    struct TestRendererData {
        renderer_data: RendererDataFields,
    }

    flight_node::impl_renderer_data!(TestRendererData);

    static DESTROY_DATA_CALLS: AtomicUsize = AtomicUsize::new(0);

    fn create_data(_state: &mut GlRenderState, _source: &NodeRef) -> Option<RendererDataRef> {
        let data: Arc<RwLock<TestRendererData>> =
            Arc::new(RwLock::new(flight_entity::allocate_entity()));
        return Some(data);
    }

    fn destroy_data(_state: &mut GlRenderState, _data: RendererDataRef) {
        DESTROY_DATA_CALLS.fetch_add(1, Ordering::SeqCst);
    }

    fn submit(_state: &mut GlRenderState, _proxy: &RenderProxy2D<GlRenderState>) {}

    static TEST_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
        format: None,
        create_data,
        destroy_data: Some(destroy_data),
        is_dirty: None,
        submit,
    };

    fn resolver(
        _state: &mut GlRenderState,
        _texture: &dyn TextureVariant,
        _premultiply: bool,
        _color_space: TextureColorSpace,
    ) -> Option<GlTextureRealization> {
        return None;
    }

    fn options_from_state(state: &GlRenderState) -> flight_render_gl::GlRenderStateOptions {
        let mut options = make_state_options();
        options.gl_registries = state.gl_registries.clone();
        options.render_registries.node_renderers = Some((*state.registries.node_renderers).clone());
        options.render_registries.canvas_shape_commands = state
            .registries
            .canvas_shape_commands
            .as_ref()
            .map(|value| (**value).clone());
        options.render_registries.effect_padding_resolvers = state
            .registries
            .effect_padding_resolvers
            .as_ref()
            .map(|value| (**value).clone());
        options.render_registries.clip_hooks = state.registries.clip_hooks;
        options.render_registries.color_adjustments = Some(state.registries.color_adjustments);
        options.render_registries.color_adjustment_unsupported_guard =
            Some(state.registries.color_adjustment_unsupported_guard);
        options.render_registries.render_root_guard = Some(state.registries.render_root_guard);
        options.render_registries.stroke_tessellator = Some(state.registries.stroke_tessellator);
        return options;
    }

    #[test]
    fn shares_context_resources_and_persistent_snapshots_through_independent_aggregates() {
        let context = make_context_state();
        let mut screen = create_gl_render_state(context.clone(), None);
        register_gl_blend_mode(
            &mut screen,
            "acme.Blend".to_string(),
            GlBlendRealization {
                src: GlBlendFactor::One,
                dst: GlBlendFactor::Zero,
                equation: None,
            },
        );
        register_gl_texture_resolver(&mut screen, "acme.Texture".to_string(), Some(resolver));
        let feature: Arc<dyn std::any::Any + Send + Sync> = Arc::new("feature".to_string());
        screen.gl_registries.color_adjustment_feature = Some(feature.clone());
        let options = options_from_state(&screen);
        let mut offscreen = create_gl_render_state(context, Some(&options));

        assert!(std::rc::Rc::ptr_eq(&offscreen.gl, &screen.gl));
        assert!(std::rc::Rc::ptr_eq(
            &offscreen.context_state,
            &screen.context_state
        ));
        assert!(std::rc::Rc::ptr_eq(
            &offscreen.context_state,
            &screen.context_state
        ));
        assert_eq!(
            offscreen
                .context_state
                .runtime_state
                .borrow()
                .quad_index_buffer,
            screen
                .context_state
                .runtime_state
                .borrow()
                .quad_index_buffer
        );
        assert!(Arc::ptr_eq(
            &offscreen.gl_registries.texture_resolvers,
            &screen.gl_registries.texture_resolvers
        ));
        assert!(Arc::ptr_eq(
            &offscreen.gl_registries.blend_realizations,
            &screen.gl_registries.blend_realizations
        ));
        assert!(Arc::ptr_eq(
            offscreen
                .gl_registries
                .color_adjustment_feature
                .as_ref()
                .unwrap(),
            &feature
        ));

        register_gl_texture_resolver(&mut screen, "acme.Texture".to_string(), None);
        assert!(offscreen
            .gl_registries
            .texture_resolvers
            .entries
            .contains_key("acme.Texture"));
        assert!(!screen
            .gl_registries
            .texture_resolvers
            .entries
            .contains_key("acme.Texture"));
        screen
            .context_state
            .runtime_state
            .borrow_mut()
            .current_blend_signature = Some(flight_render_gl::GlBlendSignature {
            dst: 1,
            equation: 2,
            src: 3,
        });
        assert!(offscreen
            .context_state
            .runtime_state
            .borrow()
            .current_blend_signature
            .is_some());
        destroy_gl_render_state(&mut offscreen, &mut make_proxies());
        destroy_gl_render_state(&mut screen, &mut make_proxies());
    }

    #[test]
    fn does_not_observe_registrations_added_after_pipeline_construction() {
        let context = make_context_state();
        let mut screen = create_gl_render_state(context.clone(), None);
        let initial = options_from_state(&screen);
        let mut offscreen = create_gl_render_state(context.clone(), Some(&initial));
        register_gl_blend_mode(
            &mut screen,
            "acme.LateBlend".to_string(),
            GlBlendRealization {
                src: GlBlendFactor::One,
                dst: GlBlendFactor::Zero,
                equation: None,
            },
        );
        register_gl_texture_resolver(&mut screen, "acme.LateTexture".to_string(), Some(resolver));
        assert!(!offscreen
            .gl_registries
            .blend_realizations
            .entries
            .contains_key("acme.LateBlend"));
        assert!(!offscreen
            .gl_registries
            .texture_resolvers
            .entries
            .contains_key("acme.LateTexture"));

        destroy_gl_render_state(&mut offscreen, &mut make_proxies());
        let rebuilt = options_from_state(&screen);
        let mut offscreen = create_gl_render_state(context, Some(&rebuilt));
        assert!(offscreen
            .gl_registries
            .blend_realizations
            .entries
            .contains_key("acme.LateBlend"));
        assert!(offscreen
            .gl_registries
            .texture_resolvers
            .entries
            .contains_key("acme.LateTexture"));
        destroy_gl_render_state(&mut offscreen, &mut make_proxies());
        destroy_gl_render_state(&mut screen, &mut make_proxies());
    }

    #[test]
    fn keeps_proxy_trees_independent_and_releases_shared_context_resources_only_at_the_end() {
        DESTROY_DATA_CALLS.store(0, Ordering::SeqCst);
        let context = make_context_state();
        let mut screen = create_gl_render_state(context.clone(), None);
        let root = flight_scene2d::create_display_object();
        let kind = root.read().unwrap().node_fields().kind.clone();
        register_node_renderer(&mut screen, kind, &TEST_RENDERER);
        let options = options_from_state(&screen);
        let mut offscreen = create_gl_render_state(context, Some(&options));
        let mut screen_proxies = make_proxies();
        let mut offscreen_proxies = make_proxies();
        let root: NodeRef = root;
        assert!(prepare_scene_2d_render(
            &mut offscreen,
            &mut offscreen_proxies,
            &root
        ));
        assert!(screen_proxies.by_uid.is_empty());
        assert_eq!(offscreen_proxies.by_uid.len(), 1);
        clear_calls();

        destroy_gl_render_state(&mut offscreen, &mut offscreen_proxies);
        assert_eq!(DESTROY_DATA_CALLS.load(Ordering::SeqCst), 1);
        assert_eq!(calls_named("delete_buffers"), 0);
        destroy_gl_render_state(&mut screen, &mut screen_proxies);
        assert_eq!(calls_named("delete_buffers"), 2);
    }
}

mod create_gl_render_state_runtime {
    use flight_render_gl::create_gl_render_state_runtime;

    use crate::gl_test_helper::{make_context_state, make_state_options};

    #[test]
    fn increments_context_ownership_and_returns_fresh_state() {
        let context = make_context_state();
        let runtime = create_gl_render_state_runtime(&context, &make_state_options());
        assert_eq!(context.runtime_state.borrow().references, 1);
        let runtime = runtime.borrow();
        assert!(!runtime.destroyed);
        assert!(runtime.current_framebuffer.is_none());
        assert!(runtime.current_scissor_rect.is_none());
        assert!(runtime.current_target.is_none());
        assert!(runtime.default_bitmap_shader.is_none());
        assert!(runtime.material_bitmap_shader_map.is_empty());
        assert!(runtime.shader_bindings.is_empty());
        assert!(context.runtime_state.borrow().binding.is_none());
        let options = make_state_options();
        assert!(options.gl_registries.blend_realizations.entries.is_empty());
        assert!(options
            .gl_registries
            .custom_effect_shaders
            .entries
            .is_empty());
        assert!(options
            .gl_registries
            .custom_material_shaders
            .entries
            .is_empty());
        assert!(options.gl_registries.material_renderers.entries.is_empty());
        assert!(options.gl_registries.modifier_snippets.entries.is_empty());
        assert!(options.gl_registries.pbr_extensions.entries.is_empty());
        assert!(options.gl_registries.velocity_writers.entries.is_empty());
    }
}

mod destroy_gl_render_state {
    use std::cell::Cell;
    use std::rc::Rc;
    use std::sync::Arc;

    use flight_render_gl::{
        create_gl_context_state, create_gl_render_state, destroy_gl_render_state,
        ensure_default_gl_bitmap_shader, initialize_gl_bitmap_shader, register_gl_context_teardown,
        use_gl_program,
    };

    use crate::gl_test_helper::{
        calls_named, calls_with, clear_calls, make_context_state, make_proxies,
    };

    #[test]
    fn deletes_shared_resources_only_after_the_last_state() {
        let context = make_context_state();
        let mut first = create_gl_render_state(context.clone(), None);
        let mut second = create_gl_render_state(context, None);
        let mut first_proxies = make_proxies();
        let mut second_proxies = make_proxies();
        destroy_gl_render_state(&mut first, &mut first_proxies);
        assert_eq!(calls_named("delete_name"), 0);
        destroy_gl_render_state(&mut second, &mut second_proxies);
        assert!(calls_named("delete_name") >= 2);
    }

    #[test]
    fn runs_registered_context_teardown_once_after_the_final_shared_owner_is_destroyed() {
        let context = make_context_state();
        let mut first = create_gl_render_state(context.clone(), None);
        let mut second = create_gl_render_state(context.clone(), None);
        let calls = Rc::new(Cell::new(0));
        let captured = calls.clone();
        register_gl_context_teardown(
            &context,
            Box::new(move |_| captured.set(captured.get() + 1)),
        );
        destroy_gl_render_state(&mut first, &mut make_proxies());
        assert_eq!(calls.get(), 0);
        assert_eq!(context.runtime_state.borrow().teardowns.len(), 1);
        destroy_gl_render_state(&mut second, &mut make_proxies());
        assert_eq!(calls.get(), 1);
        assert!(context.runtime_state.borrow().teardowns.is_empty());
    }

    #[test]
    fn does_not_delete_the_caller_owned_bitmap_shader_that_was_bound_last() {
        let context = make_context_state();
        let mut owner = create_gl_render_state(context.clone(), None);
        let owned = ensure_default_gl_bitmap_shader(&owner).unwrap();
        let caller = Arc::new(
            initialize_gl_bitmap_shader(
                &owner.gl,
                "#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main(){o=vec4(1.0);}",
                None,
            )
            .unwrap(),
        );
        use_gl_program(&owner, Some(caller.clone())).unwrap();
        clear_calls();

        destroy_gl_render_state(&mut owner, &mut make_proxies());

        let deletes = calls_with("delete_program");
        assert!(deletes
            .iter()
            .any(|call| call.integers == vec![i64::from(owned.program.0.get())]));
        assert!(!deletes
            .iter()
            .any(|call| call.integers == vec![i64::from(caller.program.0.get())]));
        let replacement_context = create_gl_context_state(context.gl.clone()).unwrap();
        let mut replacement = create_gl_render_state(replacement_context, None);
        use_gl_program(&replacement, Some(caller.clone())).unwrap();
        assert_eq!(
            calls_with("use_program").last().unwrap().integers,
            vec![i64::from(caller.program.0.get())]
        );
        destroy_gl_render_state(&mut replacement, &mut make_proxies());
    }

    #[test]
    fn deletes_quad_buffers_even_when_no_shader_was_compiled() {
        let mut state = create_gl_render_state(make_context_state(), None);
        clear_calls();
        destroy_gl_render_state(&mut state, &mut make_proxies());
        assert_eq!(calls_named("delete_program"), 0);
        assert_eq!(calls_named("delete_buffers"), 2);
    }

    #[test]
    fn is_safe_to_call_twice_without_repeating_gl_deletes() {
        let mut state = create_gl_render_state(make_context_state(), None);
        let mut proxies = make_proxies();
        clear_calls();
        destroy_gl_render_state(&mut state, &mut proxies);
        let deletes = calls_named("delete_name") + calls_named("delete_program");
        destroy_gl_render_state(&mut state, &mut proxies);
        assert_eq!(
            calls_named("delete_name") + calls_named("delete_program"),
            deletes
        );
    }

    #[test]
    fn invokes_registered_teardown_callbacks_when_the_last_reference_is_destroyed() {
        let context = make_context_state();
        let mut first = create_gl_render_state(context.clone(), None);
        let mut second = create_gl_render_state(context.clone(), None);
        let called = Rc::new(Cell::new(false));
        let captured = called.clone();
        register_gl_context_teardown(&context, Box::new(move |_| captured.set(true)));
        destroy_gl_render_state(&mut first, &mut make_proxies());
        assert!(!called.get());
        destroy_gl_render_state(&mut second, &mut make_proxies());
        assert!(called.get());
    }

    #[test]
    fn does_not_invoke_context_teardowns_while_references_remain() {
        let context = make_context_state();
        let mut first = create_gl_render_state(context.clone(), None);
        let _second = create_gl_render_state(context.clone(), None);
        let called = Rc::new(Cell::new(false));
        let captured = called.clone();
        register_gl_context_teardown(&context, Box::new(move |_| captured.set(true)));
        destroy_gl_render_state(&mut first, &mut make_proxies());
        assert!(!called.get());
        assert_eq!(context.runtime_state.borrow().references, 1);
    }
}

mod flush_gl_delete_queue {
    use flight_render_gl::{flush_gl_delete_queue, GlDeletion};
    use glow::HasContext;

    use crate::gl_test_helper::{calls_named, make_context_state};

    #[test]
    fn drains_and_executes_deferred_native_deletions() {
        let context = make_context_state();
        // SAFETY: creation and deletion use the same deterministic mock context.
        let texture = unsafe { context.gl.create_texture() }.unwrap();
        context
            .runtime_state
            .borrow()
            .delete_queue
            .0
            .lock()
            .unwrap()
            .push(GlDeletion::Texture(texture));
        flush_gl_delete_queue(&context);
        assert_eq!(calls_named("delete_name"), 1);
        assert!(context
            .runtime_state
            .borrow()
            .delete_queue
            .0
            .lock()
            .unwrap()
            .is_empty());
    }
}

mod get_gl_color_adjustment_material_feature {
    use std::sync::Arc;

    use flight_render_gl::{create_gl_render_state, get_gl_color_adjustment_material_feature};

    use crate::gl_test_helper::{make_context_state, make_state_options};

    #[test]
    fn resolves_only_a_bound_feature_entry() {
        let feature: Arc<dyn std::any::Any + Send + Sync> = Arc::new(String::from("feature"));
        let mut state = create_gl_render_state(make_context_state(), Some(&make_state_options()));
        assert!(get_gl_color_adjustment_material_feature(&state).is_none());
        state.gl_registries.color_adjustment_feature = Some(feature.clone());
        let actual = get_gl_color_adjustment_material_feature(&state).unwrap();
        assert!(Arc::ptr_eq(&feature, &actual));
        state.gl_registries.color_adjustment_feature = None;
        assert!(get_gl_color_adjustment_material_feature(&state).is_none());
    }
}

mod get_gl_color_adjustment_material_feature_guard {
    use flight_render_gl::{
        create_gl_render_state, get_gl_color_adjustment_material_feature_guard,
        GlColorAdjustmentData, GlRenderState,
    };

    use crate::gl_test_helper::{make_context_state, make_state_options};

    fn guard(_state: &mut GlRenderState, _value: &GlColorAdjustmentData) {}

    #[test]
    fn resolves_only_a_bound_guard_entry() {
        let mut state = create_gl_render_state(make_context_state(), Some(&make_state_options()));
        assert!(get_gl_color_adjustment_material_feature_guard(&state).is_none());
        state.gl_registries.color_adjustment_feature_guard = Some(guard);
        assert!(get_gl_color_adjustment_material_feature_guard(&state).is_some());
        state.gl_registries.color_adjustment_feature_guard = None;
        assert!(get_gl_color_adjustment_material_feature_guard(&state).is_none());
    }
}

mod get_gl_context_runtime {
    use flight_render_gl::get_gl_context_runtime;

    use crate::gl_test_helper::make_context_state;

    #[test]
    fn borrows_the_explicit_context_runtime() {
        let context = make_context_state();
        assert_eq!(get_gl_context_runtime(&context).references, 0);
    }
}

mod get_gl_context_runtime_mut {
    use flight_render_gl::{get_gl_context_runtime, get_gl_context_runtime_mut};

    use crate::gl_test_helper::make_context_state;

    #[test]
    fn mutates_the_explicit_context_runtime() {
        let context = make_context_state();
        get_gl_context_runtime_mut(&context).max_anisotropy = 8.0;
        assert_eq!(get_gl_context_runtime(&context).max_anisotropy, 8.0);
    }
}

mod get_gl_render_state_runtime {
    use flight_render_gl::get_gl_render_state_runtime;

    use crate::gl_test_helper::make_state;

    #[test]
    fn borrows_the_runtime_owned_by_the_given_state() {
        let state = make_state();
        assert_eq!(get_gl_render_state_runtime(&state).current_mask_depth, 0);
    }
}

mod get_gl_render_state_runtime_mut {
    use flight_render_gl::{get_gl_render_state_runtime, get_gl_render_state_runtime_mut};

    use crate::gl_test_helper::make_state;

    #[test]
    fn mutates_only_the_given_state_runtime() {
        let state = make_state();
        get_gl_render_state_runtime_mut(&state).current_mask_depth = 7;
        assert_eq!(get_gl_render_state_runtime(&state).current_mask_depth, 7);
    }
}

mod initialize_gl_context_state {
    use flight_render_gl::initialize_gl_context_state;

    use crate::gl_test_helper::make_gl;

    #[test]
    fn starts_with_live_deletion_and_empty_caches() {
        let context = initialize_gl_context_state(make_gl()).unwrap();
        let runtime = context.runtime_state.borrow();
        assert!(runtime
            .delete_queue
            .1
            .load(std::sync::atomic::Ordering::Acquire));
        assert!(runtime.texture_caches.by_texture_entity.is_empty());
        assert!(!runtime.context_lost);
    }
}

mod invalidate_gl_render_state_cache {
    use flight_render_gl::{invalidate_gl_render_state_cache, GlScissorRect};

    use crate::gl_test_helper::make_state;

    #[test]
    fn clears_state_and_shared_binding_caches() {
        let state = make_state();
        state.gl_runtime.borrow_mut().current_scissor_rect = Some(GlScissorRect {
            x: 1,
            y: 2,
            width: 3,
            height: 4,
        });
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .current_blend_signature = Some(flight_render_gl::GlBlendSignature {
            src: 1,
            dst: 2,
            equation: 3,
        });
        invalidate_gl_render_state_cache(&state);
        assert!(state.gl_runtime.borrow().current_scissor_rect.is_none());
        assert!(state
            .context_state
            .runtime_state
            .borrow()
            .current_blend_signature
            .is_none());
    }
}

mod register_gl_context_teardown {
    use std::cell::Cell;
    use std::rc::Rc;

    use flight_render_gl::{destroy_gl_render_state, register_gl_context_teardown};

    use crate::gl_test_helper::{make_proxies, make_state};

    #[test]
    fn runs_once_when_the_last_state_releases_the_context() {
        let mut state = make_state();
        let called = Rc::new(Cell::new(false));
        let capture = called.clone();
        register_gl_context_teardown(&state.context_state, Box::new(move |_| capture.set(true)));
        destroy_gl_render_state(&mut state, &mut make_proxies());
        assert!(called.get());
    }
}

mod register_gl_render_state_teardown {
    use flight_render_gl::{
        destroy_gl_render_state, register_gl_render_state_teardown, GlRenderState,
    };

    use crate::gl_test_helper::{make_proxies, make_state};

    fn teardown(state: &mut GlRenderState) {
        state.render.render_alpha = 0.25;
    }

    #[test]
    fn runs_before_the_state_is_destroyed() {
        let mut state = make_state();
        register_gl_render_state_teardown(&state, teardown);
        destroy_gl_render_state(&mut state, &mut make_proxies());
        assert_eq!(state.render.render_alpha, 0.25);
    }
}

mod set_gl_context_lost {
    use std::sync::atomic::Ordering;

    use flight_render_gl::{set_gl_context_lost, GlScissorRect};

    use crate::gl_test_helper::make_state;

    #[test]
    fn disables_deferred_deletion_and_invalidates_all_live_state_runtimes() {
        let state = make_state();
        state.gl_runtime.borrow_mut().current_scissor_rect = Some(GlScissorRect {
            x: 1,
            y: 1,
            width: 1,
            height: 1,
        });
        set_gl_context_lost(&state.context_state);
        let context = state.context_state.runtime_state.borrow();
        assert!(context.context_lost);
        assert!(!context.delete_queue.1.load(Ordering::Acquire));
        assert!(state.gl_runtime.borrow().current_scissor_rect.is_none());
    }
}
