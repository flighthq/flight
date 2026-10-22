// flight-lint: allow-file(contract-vocabulary) crate-private D15 runtime-slot caches and glow uniform helpers shared by every effect recipe
//! Crate-private support shared by every effect recipe: the D15 runtime slots that replace the TS
//! module-level WeakMaps (per GL context: compiled programs and uniform locations; per render state:
//! guards and blend backdrops), and thin safe wrappers over the glow uniform calls.

use std::collections::HashMap;

use flight_render::RenderTargetDescriptor;
use flight_render_gl::{
    GlFullscreenProgram, GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool,
    acquire_gl_texture_render_target, compile_gl_fullscreen_program,
};
use glow::{HasContext, NativeProgram, NativeTexture, NativeUniformLocation};

use crate::contract::{
    GlCustomShaderSourceGuard, GlEffectApplicationGuard, GlEffectStateSkipGuard,
};

/// Per-context caches (TS `_programs`, `_uniformLocations` and the per-recipe shader WeakMaps keyed
/// by `GlContext`). Lives in the context runtime's opaque `effect_cache` slot.
#[derive(Default)]
pub(crate) struct GlEffectContextCache {
    pub programs: HashMap<String, GlFullscreenProgram>,
    pub shaders: HashMap<String, GlFullscreenProgram>,
    pub uniform_locations: HashMap<(NativeProgram, String), Option<NativeUniformLocation>>,
}

/// Per-render-state runtime (TS `_guardedStates`, `_skipGuards`, `_guards`, `_sourceGuards` and
/// `_backdrops`, each keyed by `GlRenderState`). Lives in the state runtime's opaque
/// `effect_runtime` slot.
#[derive(Default)]
pub(crate) struct GlEffectStateRuntime {
    pub guards_enabled: bool,
    pub application_guard: Option<GlEffectApplicationGuard>,
    pub custom_shader_source_guard: Option<GlCustomShaderSourceGuard>,
    pub skip_guard: Option<GlEffectStateSkipGuard>,
    pub blend_backdrops: HashMap<String, NativeTexture>,
}

pub(crate) fn acquire_gl_effect_target(
    state: &GlRenderState,
    pool: &mut GlTextureRenderTargetPool,
    source: &GlTextureRenderTarget,
) -> Result<GlTextureRenderTarget, String> {
    let descriptor = RenderTargetDescriptor {
        width: source.axes.width as f32,
        height: source.axes.height as f32,
        format: Some(source.axes.format),
        color_attachments: None,
        color_formats: None,
        sample_count: None,
        depth: None,
        color_space: None,
    };
    return acquire_gl_texture_render_target(state, pool, &descriptor, None)?.ok_or_else(|| {
        "acquireGlTextureRenderTarget: preferred target allocation was refused".to_string()
    });
}

/// Compiles (once per context) one of the recipe-private shaders that TS keeps in its own
/// per-context WeakMap, separate from the public `get_gl_effect_program` key space.
pub(crate) fn get_gl_effect_shader(
    state: &GlRenderState,
    key: &str,
    fragment_source: &str,
) -> Result<GlFullscreenProgram, String> {
    let existing = with_gl_effect_context_cache(state, |cache| cache.shaders.get(key).cloned());
    if let Some(program) = existing {
        return Ok(program);
    }
    let compiled = compile_gl_fullscreen_program(&state.gl, fragment_source)?;
    with_gl_effect_context_cache(state, |cache| {
        cache.shaders.insert(key.to_string(), compiled.clone());
    });
    return Ok(compiled);
}

pub(crate) fn set_blend_func(gl: &glow::Context, source: u32, destination: u32) {
    // SAFETY: fixed-function blend state belongs to the fullscreen pass in progress; the pass
    // restores its normal blend signature after the draw.
    unsafe { gl.blend_func(source, destination) };
}

pub(crate) fn set_uniform_1f(gl: &glow::Context, location: Option<&NativeUniformLocation>, x: f32) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_1_f32(location, x) };
}

pub(crate) fn set_uniform_1fv(
    gl: &glow::Context,
    location: Option<&NativeUniformLocation>,
    values: &[f32],
) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_1_f32_slice(location, values) };
}

pub(crate) fn set_uniform_1i(gl: &glow::Context, location: Option<&NativeUniformLocation>, x: i32) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_1_i32(location, x) };
}

pub(crate) fn set_uniform_2f(
    gl: &glow::Context,
    location: Option<&NativeUniformLocation>,
    x: f32,
    y: f32,
) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_2_f32(location, x, y) };
}

pub(crate) fn set_uniform_2fv(
    gl: &glow::Context,
    location: Option<&NativeUniformLocation>,
    values: &[f32],
) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_2_f32_slice(location, values) };
}

pub(crate) fn set_uniform_3f(
    gl: &glow::Context,
    location: Option<&NativeUniformLocation>,
    x: f32,
    y: f32,
    z: f32,
) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_3_f32(location, x, y, z) };
}

pub(crate) fn set_uniform_3fv(
    gl: &glow::Context,
    location: Option<&NativeUniformLocation>,
    values: &[f32],
) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_3_f32_slice(location, values) };
}

pub(crate) fn set_uniform_4f(
    gl: &glow::Context,
    location: Option<&NativeUniformLocation>,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_4_f32(location, x, y, z, w) };
}

pub(crate) fn set_uniform_4fv(
    gl: &glow::Context,
    location: Option<&NativeUniformLocation>,
    values: &[f32],
) {
    // SAFETY: the location belongs to the program the fullscreen pass made current.
    unsafe { gl.uniform_4_f32_slice(location, values) };
}

/// Named-uniform conveniences mirroring the TS `gl.uniformXf(gl.getUniformLocation(p.program,
/// name), …)` idiom used inside `setUniforms` callbacks.
pub(crate) fn uniform_1f(gl: &glow::Context, program: &GlFullscreenProgram, name: &str, x: f32) {
    set_uniform_1f(gl, uniform_location(gl, program, name).as_ref(), x);
}

pub(crate) fn uniform_1fv(
    gl: &glow::Context,
    program: &GlFullscreenProgram,
    name: &str,
    values: &[f32],
) {
    set_uniform_1fv(gl, uniform_location(gl, program, name).as_ref(), values);
}

pub(crate) fn uniform_1i(gl: &glow::Context, program: &GlFullscreenProgram, name: &str, x: i32) {
    set_uniform_1i(gl, uniform_location(gl, program, name).as_ref(), x);
}

pub(crate) fn uniform_2f(
    gl: &glow::Context,
    program: &GlFullscreenProgram,
    name: &str,
    x: f32,
    y: f32,
) {
    set_uniform_2f(gl, uniform_location(gl, program, name).as_ref(), x, y);
}

pub(crate) fn uniform_3f(
    gl: &glow::Context,
    program: &GlFullscreenProgram,
    name: &str,
    x: f32,
    y: f32,
    z: f32,
) {
    set_uniform_3f(gl, uniform_location(gl, program, name).as_ref(), x, y, z);
}

pub(crate) fn uniform_4f(
    gl: &glow::Context,
    program: &GlFullscreenProgram,
    name: &str,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) {
    set_uniform_4f(gl, uniform_location(gl, program, name).as_ref(), x, y, z, w);
}

pub(crate) fn uniform_location(
    gl: &glow::Context,
    program: &GlFullscreenProgram,
    name: &str,
) -> Option<NativeUniformLocation> {
    // SAFETY: the program is a linked program of this context.
    return unsafe { gl.get_uniform_location(program.program, name) };
}

pub(crate) fn with_gl_effect_context_cache<T>(
    state: &GlRenderState,
    callback: impl FnOnce(&mut GlEffectContextCache) -> T,
) -> T {
    let mut runtime = state.context_state.runtime_state.borrow_mut();
    if runtime
        .effect_cache
        .as_ref()
        .is_none_or(|slot| !slot.is::<GlEffectContextCache>())
    {
        runtime.effect_cache = Some(Box::new(GlEffectContextCache::default()));
    }
    let cache = runtime
        .effect_cache
        .as_mut()
        .and_then(|slot| slot.downcast_mut::<GlEffectContextCache>())
        .expect("effect cache slot was just initialized");
    return callback(cache);
}

pub(crate) fn with_gl_effect_state_runtime<T>(
    state: &GlRenderState,
    callback: impl FnOnce(&mut GlEffectStateRuntime) -> T,
) -> T {
    let mut runtime = state.gl_runtime.borrow_mut();
    if runtime
        .effect_runtime
        .as_ref()
        .is_none_or(|slot| !slot.is::<GlEffectStateRuntime>())
    {
        runtime.effect_runtime = Some(Box::new(GlEffectStateRuntime::default()));
    }
    let slot = runtime
        .effect_runtime
        .as_mut()
        .and_then(|slot| slot.downcast_mut::<GlEffectStateRuntime>())
        .expect("effect runtime slot was just initialized");
    return callback(slot);
}
