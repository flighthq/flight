// flight-lint: allow-file(contract-vocabulary) D17 program cache returns native glow programs, uniform locations and Result diagnostics
//! Per-context cache of compiled effect fragment programs, keyed by a stable string. Effect recipes
//! call `get_gl_effect_program` with their own key + fragment source so each program compiles once
//! per context and is reused every frame. The cache lives in the context runtime's effect slot
//! (D15), so two states over one context share it and two contexts never do.

use flight_render_gl::{GlFullscreenProgram, GlRenderState, compile_gl_fullscreen_program};
use glow::{HasContext, NativeUniformLocation};

use crate::gl_effect_support::with_gl_effect_context_cache;

/// Returns the program compiled for `key` on this state's context, compiling `fragment_source` the
/// first time. The KEY identifies the program, not the source text: an effect that varies its
/// shader must vary its key too.
pub fn get_gl_effect_program(
    state: &GlRenderState,
    key: &str,
    fragment_source: &str,
) -> Result<GlFullscreenProgram, String> {
    let existing = with_gl_effect_context_cache(state, |cache| cache.programs.get(key).cloned());
    if let Some(program) = existing {
        return Ok(program);
    }
    let compiled = compile_gl_fullscreen_program(&state.gl, fragment_source)?;
    with_gl_effect_context_cache(state, |cache| {
        cache.programs.insert(key.to_string(), compiled.clone());
    });
    return Ok(compiled);
}

/// Returns a cached uniform location for the given program and uniform name. The texture-slot
/// locations are already resolved by `compile_gl_fullscreen_program`; this cache covers the
/// per-effect uniforms. A `None` answer (a uniform the driver optimised away) is cached too.
pub fn get_gl_effect_uniform_location(
    state: &GlRenderState,
    program: &GlFullscreenProgram,
    name: &str,
) -> Option<NativeUniformLocation> {
    let key = (program.program, name.to_string());
    let existing =
        with_gl_effect_context_cache(state, |cache| cache.uniform_locations.get(&key).cloned());
    if let Some(location) = existing {
        return location;
    }
    // SAFETY: the program is a linked program of this state's context.
    let location = unsafe { state.gl.get_uniform_location(program.program, name) };
    with_gl_effect_context_cache(state, |cache| {
        cache.uniform_locations.insert(key, location);
    });
    return location;
}
