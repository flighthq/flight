// flight-lint: allow-file(contract-vocabulary) D17 state ownership intentionally exposes thread-bound Rc/RefCell glow context and explicit teardown callbacks

use std::cell::{Ref, RefMut};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, get_entity_id};
use flight_registry::KindMap;
use flight_render::{
    RenderProxies2D, RenderRegistries, RenderStateFields, RenderStateRuntime, destroy_render_state,
};
use glow::HasContext;

use crate::{
    GlContextRuntime, GlContextState, GlDeleteQueue, GlDeletion, GlRenderRegistries, GlRenderState,
    GlRenderStateOptions, GlRenderStateRuntime, GlTextureCaches, destroy_gl_texture_render_target,
};

pub fn create_gl_context_state(gl: Rc<glow::Context>) -> Result<Rc<GlContextState>, String> {
    return initialize_gl_context_state(gl).map(Rc::new);
}

// flight-lint: allow(conform-params) D17 state creation consumes the explicit context owner rather than an unowned raw WebGL context
pub fn create_gl_render_state(
    context_state: Rc<GlContextState>,
    options: Option<&GlRenderStateOptions>,
) -> GlRenderState {
    let defaults = GlRenderStateOptions::default();
    let options = options.unwrap_or(&defaults);
    let fields = RenderStateFields::default();

    let registries = build_render_registries(options);
    let gl_registries = build_gl_render_registries(options);
    let gl_runtime = create_gl_render_state_runtime(&context_state, options);
    let gl = Rc::clone(&context_state.gl);
    let state = GlRenderState {
        render: fields,
        runtime: RenderStateRuntime::default(),
        registries,
        gl: Rc::clone(&gl),
        context_state: Rc::clone(&context_state),
        gl_runtime: Rc::clone(&gl_runtime),
        gl_registries,
        apply_blend_mode: None,
        canvas_host: options.canvas_host.clone(),
        image_host: options.image_host.clone(),
    };
    let state_id = get_entity_id(&state);
    {
        let mut context = context_state.runtime_state.borrow_mut();
        context
            .state_runtimes
            .insert(state_id, Rc::downgrade(&gl_runtime));
    }

    // SAFETY: render-state construction occurs on the current GL thread.
    unsafe {
        gl.enable(glow::BLEND);
        gl.blend_func(glow::ONE, glow::ONE_MINUS_SRC_ALPHA);
        gl.disable(glow::DEPTH_TEST);
    }
    return state;
}

pub fn create_gl_render_state_runtime(
    context_state: &Rc<GlContextState>,
    _options: &GlRenderStateOptions,
) -> Rc<std::cell::RefCell<GlRenderStateRuntime>> {
    context_state.runtime_state.borrow_mut().references += 1;
    return Rc::new(std::cell::RefCell::new(GlRenderStateRuntime::default()));
}

// flight-lint: allow(conform-params) D17 native construction returns the initialized context value
pub fn initialize_gl_context_state(gl: Rc<glow::Context>) -> Result<GlContextState, String> {
    // SAFETY: creation is called on the thread where the provider made this context current.
    let quad_index_buffer = unsafe { gl.create_buffer() }
        .map_err(|error| format!("createGlContextState: create quad index buffer: {error}"))?;
    // SAFETY: the buffer belongs to this current context and the byte slice lives through the call.
    unsafe {
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(quad_index_buffer));
        gl.buffer_data_u8_slice(
            glow::ELEMENT_ARRAY_BUFFER,
            &[0, 0, 1, 0, 2, 0, 0, 0, 2, 0, 3, 0],
            glow::STATIC_DRAW,
        );
    }
    // SAFETY: creation is called on the current GL thread.
    let quad_vertex_buffer = match unsafe { gl.create_buffer() } {
        Ok(buffer) => buffer,
        Err(error) => {
            // SAFETY: the first buffer was created by this context and is not shared yet.
            unsafe { gl.delete_buffer(quad_index_buffer) };
            return Err(format!(
                "createGlContextState: create quad vertex buffer: {error}"
            ));
        }
    };
    // SAFETY: the buffer belongs to this current context.
    unsafe {
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(quad_vertex_buffer));
        gl.buffer_data_size(glow::ARRAY_BUFFER, 64, glow::DYNAMIC_DRAW);
    }

    return Ok(GlContextState {
        runtime: EntityRuntimeSlot::default(),
        gl,
        runtime_state: std::cell::RefCell::new(GlContextRuntime {
            binding: None,
            current_blend_signature: None,
            current_texture_realization: None,
            quad_index_buffer: Some(quad_index_buffer),
            quad_vertex_buffer: Some(quad_vertex_buffer),
            references: 0,
            teardowns: Vec::new(),
            texture_caches: GlTextureCaches::default(),
            delete_queue: GlDeleteQueue::default(),
            context_lost: false,
            anisotropy_extension: None,
            max_anisotropy: 1.0,
            unpack_premultiply_alpha: false,
            fill_program: None,
            fullscreen_programs: HashMap::new(),
            quad_vertex_array: None,
            color_adjustment_resources: None,
            particle_resources: None,
            quad_batch_resources: None,
            shape_mesh_resources: None,
            scene2d_context_runtime: None,
            pass_handle_pool: Vec::new(),
            pass_stack: Vec::new(),
            state_runtimes: HashMap::new(),
            effect_cache: None,
        }),
    });
}

pub fn build_gl_render_registries(options: &GlRenderStateOptions) -> GlRenderRegistries {
    return options.gl_registries.clone();
}

fn build_render_registries(options: &GlRenderStateOptions) -> RenderRegistries<GlRenderState> {
    let source = &options.render_registries;
    return RenderRegistries {
        canvas_shape_commands: source
            .canvas_shape_commands
            .as_ref()
            .map(|value| Arc::new(value.clone())),
        clip_hooks: source.clip_hooks,
        color_adjustments: source.color_adjustments.flatten(),
        color_adjustment_unsupported_guard: source.color_adjustment_unsupported_guard.flatten(),
        effect_padding_resolvers: source
            .effect_padding_resolvers
            .as_ref()
            .map(|value| Arc::new(value.clone())),
        node_renderers: source.node_renderers.as_ref().map_or_else(
            || {
                Arc::new(KindMap {
                    entries: HashMap::new(),
                    key_order: Vec::new(),
                })
            },
            |value| Arc::new(value.clone()),
        ),
        render_root_guard: source.render_root_guard.flatten(),
        skinned_mesh_bounds_guard: None,
        stroke_tessellator: source.stroke_tessellator.flatten(),
    };
}

// flight-lint: allow(hashmap-iteration, conform-params) D17 explicit proxy ownership is required for teardown; GL deletion order is unobservable
pub fn destroy_gl_render_state(
    state: &mut GlRenderState,
    proxies: &mut RenderProxies2D<GlRenderState>,
) {
    if state.gl_runtime.borrow().destroyed {
        return;
    }
    let teardowns = {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.destroyed = true;
        std::mem::take(&mut runtime.teardowns)
    };
    for teardown in teardowns {
        teardown(state);
    }
    destroy_render_state(state, proxies);

    let state_id = get_entity_id(state);
    let should_destroy_context = {
        let mut context = state.context_state.runtime_state.borrow_mut();
        context.state_runtimes.remove(&state_id);
        context.references = context.references.saturating_sub(1);
        context.references == 0
    };
    if !should_destroy_context {
        return;
    }

    let mut programs = state
        .gl_runtime
        .borrow()
        .default_bitmap_shader
        .as_ref()
        .map(|shader| shader.program)
        .into_iter()
        .collect::<HashSet<_>>();
    let (
        owned_textures,
        render_targets,
        resource_buffers,
        quad_index_buffer,
        quad_vertex_array,
        quad_vertex_buffer,
        teardowns,
    ) = {
        let mut context = state.context_state.runtime_state.borrow_mut();
        programs.extend(
            context
                .fullscreen_programs
                .values()
                .map(|program| program.program),
        );
        if let Some(program) = &context.fill_program {
            programs.insert(program.program);
        }
        if let Some(resources) = &context.particle_resources {
            programs.insert(resources.shader.program);
        }
        if let Some(resources) = &context.quad_batch_resources {
            programs.insert(resources.shader.program);
        }
        if let Some(resources) = &context.color_adjustment_resources {
            programs.insert(resources.scale_bias_instanced_shader.program);
            programs.insert(resources.matrix_instanced_shader.program);
            programs.insert(resources.tint_instanced_shader.program);
            programs.insert(resources.uniform_scale_bias_shader.program);
        }
        if let Some(resources) = &context.shape_mesh_resources {
            if let Some(shader) = &resources.color_scale_bias_shader {
                programs.insert(shader.program);
            }
            if let Some(shader) = &resources.color_matrix_shader {
                programs.insert(shader.program);
            }
        }
        let mut resource_buffers = Vec::new();
        if let Some(resources) = context.particle_resources.take() {
            resource_buffers.push(resources.corner_buffer);
            resource_buffers.push(resources.instance_buffer);
        }
        if let Some(resources) = context.quad_batch_resources.take() {
            resource_buffers.push(resources.corner_buffer);
            resource_buffers.extend(resources.writer_instance_buffer);
            resource_buffers.extend(resources.writer_material_buffer);
            resource_buffers.extend(resources.writer_color_scale_bias_buffer);
        }
        let owned_textures = context
            .texture_caches
            .by_texture_entity
            .values()
            .map(|entry| entry.texture)
            .collect::<HashSet<_>>();
        let render_targets =
            std::mem::take(&mut context.texture_caches.render_target_by_source_entity)
                .into_values()
                .collect::<Vec<_>>();
        context.texture_caches.by_texture_entity.clear();
        context.texture_caches.mipmapped.clear();
        context.texture_caches.external_by_source_entity.clear();
        (
            owned_textures,
            render_targets,
            resource_buffers,
            context.quad_index_buffer.take(),
            context.quad_vertex_array.take(),
            context.quad_vertex_buffer.take(),
            std::mem::take(&mut context.teardowns),
        )
    };
    for teardown in teardowns {
        teardown(&state.gl);
    }
    if state.context_state.runtime_state.borrow().context_lost {
        return;
    }
    for target in render_targets {
        destroy_gl_texture_render_target(&mut target.borrow_mut().target);
    }
    flush_gl_delete_queue(&state.context_state);
    // SAFETY: the state is destroyed on its owning GL thread and every handle was created by it.
    unsafe {
        for program in programs {
            state.gl.delete_program(program);
        }
        for texture in owned_textures {
            state.gl.delete_texture(texture);
        }
        if let Some(buffer) = quad_index_buffer {
            state.gl.delete_buffer(buffer);
        }
        if let Some(buffer) = quad_vertex_buffer {
            state.gl.delete_buffer(buffer);
        }
        if let Some(vertex_array) = quad_vertex_array {
            state.gl.delete_vertex_array(vertex_array);
        }
        for buffer in resource_buffers {
            state.gl.delete_buffer(buffer);
        }
    }
}

// flight-lint: allow(hashmap-iteration, conform-extra) D17 deferred native-name deletion is an explicit GL-thread synchronization point with unobservable cache order
pub fn flush_gl_delete_queue(context_state: &GlContextState) {
    let deletions = {
        let context = context_state.runtime_state.borrow();
        let mut queue = context.delete_queue.0.lock().unwrap();
        std::mem::take(&mut *queue)
    };
    if context_state.runtime_state.borrow().context_lost {
        return;
    }
    for deletion in deletions {
        match deletion {
            // SAFETY: this explicit flush is called only at a GL-thread state boundary.
            GlDeletion::Buffer(handle) => unsafe { context_state.gl.delete_buffer(handle) },
            // SAFETY: this explicit flush is called only at a GL-thread state boundary.
            GlDeletion::Framebuffer(handle) => unsafe {
                context_state.gl.delete_framebuffer(handle)
            },
            // SAFETY: this explicit flush is called only at a GL-thread state boundary.
            GlDeletion::Program(handle) => unsafe { context_state.gl.delete_program(handle) },
            // SAFETY: this explicit flush is called only at a GL-thread state boundary.
            GlDeletion::Renderbuffer(handle) => unsafe {
                context_state.gl.delete_renderbuffer(handle)
            },
            // SAFETY: this explicit flush is called only at a GL-thread state boundary.
            GlDeletion::Shader(handle) => unsafe { context_state.gl.delete_shader(handle) },
            // SAFETY: this explicit flush is called only at a GL-thread state boundary.
            GlDeletion::Texture(handle) => unsafe { context_state.gl.delete_texture(handle) },
            // SAFETY: this explicit flush is called only at a GL-thread state boundary.
            GlDeletion::VertexArray(handle) => unsafe {
                context_state.gl.delete_vertex_array(handle)
            },
            GlDeletion::TextureEntity(entity_id) => {
                let handles = {
                    let mut context = context_state.runtime_state.borrow_mut();
                    let keys = context
                        .texture_caches
                        .by_texture_entity
                        .keys()
                        .filter(|(source_id, _, _)| *source_id == entity_id)
                        .copied()
                        .collect::<Vec<_>>();
                    keys.into_iter()
                        .filter_map(|key| {
                            context
                                .texture_caches
                                .by_texture_entity
                                .remove(&key)
                                .map(|entry| entry.texture)
                        })
                        .collect::<HashSet<_>>()
                };
                for handle in handles {
                    // SAFETY: cache-owned handles are deleted only at this GL-thread boundary.
                    unsafe { context_state.gl.delete_texture(handle) };
                }
            }
        }
    }
}

pub fn get_gl_color_adjustment_material_feature(
    state: &GlRenderState,
) -> Option<crate::GlColorAdjustmentMaterialFeature> {
    return state.gl_registries.color_adjustment_feature.clone();
}

pub fn get_gl_color_adjustment_material_feature_guard(
    state: &GlRenderState,
) -> Option<crate::GlColorAdjustmentMaterialFeatureGuard> {
    return state.gl_registries.color_adjustment_feature_guard;
}

pub fn get_gl_context_runtime(context_state: &GlContextState) -> Ref<'_, GlContextRuntime> {
    return context_state.runtime_state.borrow();
}

// flight-lint: allow(conform-extra) D12 exposes generic state runtime access without hidden singleton state
pub fn get_gl_context_runtime_mut(context_state: &GlContextState) -> RefMut<'_, GlContextRuntime> {
    return context_state.runtime_state.borrow_mut();
}

pub fn get_gl_render_state_runtime(state: &GlRenderState) -> Ref<'_, GlRenderStateRuntime> {
    return state.gl_runtime.borrow();
}

// flight-lint: allow(conform-extra) D12 exposes generic renderer runtime access without hidden singleton state
pub fn get_gl_render_state_runtime_mut(state: &GlRenderState) -> RefMut<'_, GlRenderStateRuntime> {
    return state.gl_runtime.borrow_mut();
}

pub fn invalidate_gl_render_state_cache(state: &GlRenderState) {
    {
        let mut runtime = state.gl_runtime.borrow_mut();
        runtime.current_framebuffer = None;
        runtime.current_mask_depth = 0;
        runtime.current_scissor_rect = None;
        runtime.current_target = None;
        runtime.render_target_viewport = None;
    }
    let mut context = state.context_state.runtime_state.borrow_mut();
    context.binding = None;
    context.current_blend_signature = None;
    context.current_texture_realization = None;
}

pub fn register_gl_context_teardown(
    context_state: &GlContextState,
    teardown: Box<dyn FnOnce(&glow::Context)>,
) {
    context_state
        .runtime_state
        .borrow_mut()
        .teardowns
        .push(teardown);
}

pub fn register_gl_render_state_teardown(state: &GlRenderState, teardown: fn(&mut GlRenderState)) {
    state.gl_runtime.borrow_mut().teardowns.push(teardown);
}

// flight-lint: allow(hashmap-iteration, conform-extra) D17 explicit native context-loss invalidation has no observable per-state ordering
pub fn set_gl_context_lost(context_state: &GlContextState) {
    let mut context = context_state.runtime_state.borrow_mut();
    context.context_lost = true;
    context
        .delete_queue
        .1
        .store(false, std::sync::atomic::Ordering::Release);
    context.binding = None;
    context.current_blend_signature = None;
    context.current_texture_realization = None;
    context.quad_index_buffer = None;
    context.quad_vertex_buffer = None;
    context.quad_vertex_array = None;
    context.fill_program = None;
    context.fullscreen_programs.clear();
    context.texture_caches = GlTextureCaches::default();
    context.pass_stack.clear();
    context.pass_handle_pool.clear();
    context.delete_queue.0.lock().unwrap().clear();
    for runtime in context
        .state_runtimes
        .values()
        .filter_map(std::rc::Weak::upgrade)
    {
        let mut runtime = runtime.borrow_mut();
        runtime.current_framebuffer = None;
        runtime.current_mask_depth = 0;
        runtime.current_pass = None;
        runtime.current_scissor_rect = None;
        runtime.current_target = None;
        runtime.render_target_viewport = None;
        runtime.scissor_stack.clear();
        runtime.clip_forms.clear();
    }
}
