// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Runs a user-authored fragment shader as a fullscreen post-process pass. The descriptor carries a
//! `shader_key` — a reference into the per-state custom-shader registry populated by
//! `register_gl_custom_shader_source` — plus a flat `uniforms` bag. The referenced fragment source
//! reads the input as `u_texture0` and writes `o_color`. If the key is unregistered the pass copies
//! the input through unchanged, so a missing shader degrades to identity.

use std::sync::Arc;

use flight_effects::{CustomShaderEffect, CustomShaderUniformValue, Effect};
use flight_registry::with_kind_map_entry;
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{
    GlCustomShaderSourceGuard, GlEffectContext, get_gl_effect_program,
    get_gl_effect_uniform_location, register_gl_effect,
};
use crate::gl_effect_support::{
    set_uniform_1f, set_uniform_1fv, set_uniform_2fv, set_uniform_3fv, set_uniform_4fv,
    with_gl_effect_state_runtime,
};

const PASSTHROUGH_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}"#;

// flight-lint: allow(hashmap-iteration) each named uniform of the bag is written exactly once (names are sorted first); upload order is unobservable
pub fn apply_custom_shader_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &CustomShaderEffect,
) -> Result<(), String> {
    let Some(fragment_source) = get_gl_custom_shader_source(state, &effect.shader_key) else {
        let passthrough =
            get_gl_effect_program(state, "custom.passthrough", PASSTHROUGH_FRAGMENT_SRC)?;
        return draw_gl_fullscreen_pass(
            state,
            &passthrough,
            &[source.texture],
            Some(dest),
            |_gl, _p| {},
        );
    };

    let program = get_gl_effect_program(
        state,
        &format!("custom.{}", effect.shader_key),
        &fragment_source,
    )?;
    // Uniform locations resolve through the per-program cache before the draw borrows the state.
    // The bag is a HashMap; each name is written once, so upload order is unobservable.
    let mut uploads = Vec::new();
    if let Some(uniforms) = &effect.uniforms {
        let mut names: Vec<&String> = Vec::new();
        for name in uniforms.keys() {
            names.push(name);
        }
        names.sort();
        for name in names {
            let Some(location) = get_gl_effect_uniform_location(state, &program, name) else {
                continue;
            };
            uploads.push((location, uniforms[name].clone()));
        }
    }
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, _p| {
        for (location, value) in &uploads {
            match value {
                CustomShaderUniformValue::Number(value) => {
                    set_uniform_1f(gl, Some(location), *value)
                }
                // Vector uniforms by component count; any other length uploads as a float array.
                // Matrix uniforms are intentionally out of scope for this dynamic path.
                CustomShaderUniformValue::NumberList(values) => match values.len() {
                    1 => set_uniform_1f(gl, Some(location), values[0]),
                    2 => set_uniform_2fv(gl, Some(location), values),
                    3 => set_uniform_3fv(gl, Some(location), values),
                    4 => set_uniform_4fv(gl, Some(location), values),
                    _ => set_uniform_1fv(gl, Some(location), values),
                },
            }
        }
    });
}

/// Returns the fragment source registered under `shader_key` for this state, or `None`.
pub fn get_gl_custom_shader_source(state: &GlRenderState, shader_key: &str) -> Option<String> {
    return state
        .gl_registries
        .custom_effect_shaders
        .entries
        .get(shader_key)
        .cloned();
}

pub fn gl_custom_shader_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<CustomShaderEffect>() else {
        return Ok(());
    };
    return apply_custom_shader_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

/// Whether this CustomShaderEffect names a shaderKey that has source registered for the state. An
/// effect that does not still RUNS — it copies the input through unchanged.
pub fn is_gl_custom_shader_effect_resolvable(
    state: &mut GlRenderState,
    effect: &dyn Effect,
) -> bool {
    let shader_key = match effect.as_any().downcast_ref::<CustomShaderEffect>() {
        Some(effect) => effect.shader_key.clone(),
        None => match effect.get_effect_field("shaderKey") {
            Some(flight_effects::EffectValue::Text(key)) => key,
            _ => return false,
        },
    };
    return get_gl_custom_shader_source(state, &shader_key).is_some();
}

pub fn register_gl_custom_shader_effect(state: &mut GlRenderState) {
    // The resolver is what makes the identity-passthrough fallback visible.
    register_gl_effect(
        state,
        "CustomShaderEffect",
        gl_custom_shader_effect_runner,
        Some(is_gl_custom_shader_effect_resolvable),
    );
}

/// Registers a fragment shader source under `shader_key` for this state. Last write wins for the
/// source lookup, while the compiled program is cached by key — so the two disagree after a
/// re-registration of DIFFERENT source; the guard reports that divergence.
pub fn register_gl_custom_shader_source(
    state: &mut GlRenderState,
    shader_key: &str,
    fragment_source: &str,
) {
    if let Some(previous_source) = get_gl_custom_shader_source(state, shader_key)
        && previous_source != fragment_source
    {
        let guard = with_gl_effect_state_runtime(state, |runtime| {
            runtime.custom_shader_source_guard.clone()
        });
        if let Some(guard) = guard {
            guard(state, shader_key, &previous_source, fragment_source);
        }
    }
    state.gl_registries.custom_effect_shaders = Arc::new(with_kind_map_entry(
        &state.gl_registries.custom_effect_shaders,
        shader_key.to_string(),
        fragment_source.to_string(),
    ));
}

/// Installs (or clears, with `None`) the re-registration guard for this state.
pub fn set_gl_custom_shader_source_guard(
    state: &GlRenderState,
    guard: Option<GlCustomShaderSourceGuard>,
) {
    with_gl_effect_state_runtime(state, |runtime| runtime.custom_shader_source_guard = guard);
}
