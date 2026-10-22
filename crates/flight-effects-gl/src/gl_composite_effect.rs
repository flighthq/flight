// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Porter-Duff composite pass: sample the incoming layer (`u_texture0`) and a registered backdrop
//! (`u_texture1`), combine them with the coverage factors of the effect's `operator`
//! (`Fa*layer + Fb*backdrop` on premultiplied color), and write to `dest`. The backdrop is shared
//! with BlendEffect (registered through `register_gl_blend_effect_backdrop`); a missing key
//! composites over an implicit transparent backdrop.

use flight_effects::{
    COMPOSITE_OPERATOR_CLEAR, COMPOSITE_OPERATOR_COPY, COMPOSITE_OPERATOR_DESTINATION_ATOP,
    COMPOSITE_OPERATOR_DESTINATION_IN, COMPOSITE_OPERATOR_DESTINATION_OUT,
    COMPOSITE_OPERATOR_DESTINATION_OVER, COMPOSITE_OPERATOR_SOURCE_ATOP,
    COMPOSITE_OPERATOR_SOURCE_IN, COMPOSITE_OPERATOR_SOURCE_OUT, COMPOSITE_OPERATOR_SOURCE_OVER,
    COMPOSITE_OPERATOR_XOR, CompositeEffect, Effect,
};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{
    GlEffectContext, get_gl_effect_program, get_gl_effect_uniform_location, register_gl_effect,
};
use crate::gl_effect_support::{set_uniform_1i, with_gl_effect_state_runtime};

// CompositeOperator → shader branch index, in lockstep with the if-chain in COMPOSITE_FRAGMENT_SRC.
const COMPOSITE_OPERATOR_INDEX: [(&str, i32); 11] = [
    (COMPOSITE_OPERATOR_SOURCE_OVER, 0),
    (COMPOSITE_OPERATOR_DESTINATION_OVER, 1),
    (COMPOSITE_OPERATOR_SOURCE_IN, 2),
    (COMPOSITE_OPERATOR_DESTINATION_IN, 3),
    (COMPOSITE_OPERATOR_SOURCE_OUT, 4),
    (COMPOSITE_OPERATOR_DESTINATION_OUT, 5),
    (COMPOSITE_OPERATOR_SOURCE_ATOP, 6),
    (COMPOSITE_OPERATOR_DESTINATION_ATOP, 7),
    (COMPOSITE_OPERATOR_XOR, 8),
    (COMPOSITE_OPERATOR_COPY, 9),
    (COMPOSITE_OPERATOR_CLEAR, 10),
];

// Premultiplied Porter-Duff fragment shader. Layer = u_texture0, backdrop = u_texture1.
const COMPOSITE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform int u_operator;
uniform int u_hasBackdrop;
out vec4 o_color;

void main() {
  vec4 layer = texture(u_texture0, v_texCoord);
  vec4 back = u_hasBackdrop == 1 ? texture(u_texture1, v_texCoord) : vec4(0.0);
  float as = layer.a;
  float ab = back.a;

  float fa = 1.0;
  float fb = 1.0 - as;                                              // SourceOver (0, default)
  if (u_operator == 1) { fa = 1.0 - ab; fb = 1.0; }                 // DestinationOver
  else if (u_operator == 2) { fa = ab; fb = 0.0; }                  // SourceIn
  else if (u_operator == 3) { fa = 0.0; fb = as; }                  // DestinationIn
  else if (u_operator == 4) { fa = 1.0 - ab; fb = 0.0; }            // SourceOut
  else if (u_operator == 5) { fa = 0.0; fb = 1.0 - as; }            // DestinationOut
  else if (u_operator == 6) { fa = ab; fb = 1.0 - as; }            // SourceAtop
  else if (u_operator == 7) { fa = 1.0 - ab; fb = as; }            // DestinationAtop
  else if (u_operator == 8) { fa = 1.0 - ab; fb = 1.0 - as; }      // Xor
  else if (u_operator == 9) { fa = 1.0; fb = 0.0; }                // Copy
  else if (u_operator == 10) { fa = 0.0; fb = 0.0; }               // Clear

  o_color = fa * layer + fb * back;
}"#;

pub fn apply_composite_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &CompositeEffect,
) -> Result<(), String> {
    // The per-state backdrop registry shared with BlendEffect (TS `getGlBlendEffectBackdrop`).
    let backdrop = effect.backdrop_key.as_ref().and_then(|key| {
        with_gl_effect_state_runtime(state, |runtime| runtime.blend_backdrops.get(key).copied())
    });
    let program = get_gl_effect_program(state, "composite.porterduff", COMPOSITE_FRAGMENT_SRC)?;
    let operator_index = get_composite_effect_operator_index(&effect.operator);
    let has_backdrop = backdrop.is_some();
    // Bind the layer to unit 0 and the backdrop (or the layer itself as a harmless stand-in) to
    // unit 1; `u_hasBackdrop` gates whether unit 1 is read.
    let inputs = [source.texture, backdrop.unwrap_or(source.texture)];
    let operator_location = get_gl_effect_uniform_location(state, &program, "u_operator");
    let has_backdrop_location = get_gl_effect_uniform_location(state, &program, "u_hasBackdrop");
    return draw_gl_fullscreen_pass(state, &program, &inputs, Some(dest), |gl, _p| {
        if operator_location.is_some() {
            set_uniform_1i(gl, operator_location.as_ref(), operator_index);
        }
        if has_backdrop_location.is_some() {
            set_uniform_1i(
                gl,
                has_backdrop_location.as_ref(),
                if has_backdrop { 1 } else { 0 },
            );
        }
    });
}

/// Maps a CompositeOperator string to the integer the fragment shader switches on. An unknown
/// (vendor) operator maps to 0 (SourceOver).
pub fn get_composite_effect_operator_index(operator: &str) -> i32 {
    return COMPOSITE_OPERATOR_INDEX
        .iter()
        .find(|(name, _)| *name == operator)
        .map_or(0, |(_, index)| *index);
}

pub fn gl_composite_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<CompositeEffect>() else {
        return Ok(());
    };
    return apply_composite_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_composite_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "CompositeEffect", gl_composite_effect_runner, None);
}
