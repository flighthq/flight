// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets, resolve open texture variants and return Result diagnostics
//! Flash-style bitmap displacement: a displacement map texture's selected channels offset where the
//! source is sampled. A missing or unresolvable map copies the input through unchanged.

use std::sync::PoisonError;

use flight_bitmap::ImageChannel;
use flight_effects::{BitmapDisplacementEffect, BitmapDisplacementEffectEdgeMode, Effect};
use flight_render::RENDER_TARGET_TEXTURE_SOURCE_KIND;
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass, resolve_gl_texture,
};
use flight_texture::{RenderTargetColorSpace, TextureColorSpace, TextureUvTransform};

use crate::contract::{
    GlEffectContext, get_gl_effect_program, get_gl_effect_uniform_location, register_gl_effect,
};
use crate::gl_effect_support::{set_uniform_1i, set_uniform_2f};

pub const BITMAP_DISPLACEMENT_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform int u_componentX;
uniform int u_componentY;
uniform int u_edgeMode;
uniform int u_mapIsRenderTarget;
uniform vec2 u_resolution;
uniform vec2 u_scale;
out vec4 o_color;

float sampleChannel(vec4 value, int component) {
  if (component == 0) return value.r;
  if (component == 1) return value.g;
  if (component == 2) return value.b;
  return value.a;
}

void main() {
  // Fullscreen GL texcoords and render-target textures are bottom-origin. Uploaded Bitmap/Image map
  // rows are top-origin, so reflect only that source family; a RenderTarget map already matches.
  vec2 mapUv = vec2(v_texCoord.x, u_mapIsRenderTarget == 1 ? v_texCoord.y : 1.0 - v_texCoord.y);
  vec4 mapSample = texture(u_texture1, mapUv);
  vec2 mapped = vec2(
    sampleChannel(mapSample, u_componentX),
    sampleChannel(mapSample, u_componentY)
  );
  vec2 displacementPixels = (mapped - vec2(0.5)) * u_scale;
  vec2 displacement = displacementPixels / u_resolution;
  vec2 displaced = vec2(v_texCoord.x + displacement.x, v_texCoord.y - displacement.y);
  vec2 sourceUv = u_edgeMode == 1
    ? fract(displaced)
    : clamp(displaced, vec2(0.0), vec2(1.0));
  o_color = texture(u_texture0, sourceUv);
}"#;

const BITMAP_DISPLACEMENT_PASSTHROUGH_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}"#;

pub fn apply_bitmap_displacement_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &BitmapDisplacementEffect,
) -> Result<(), String> {
    let map_texture = match &effect.map {
        None => None,
        Some(map) => {
            let map = map.read().unwrap_or_else(PoisonError::into_inner);
            resolve_gl_texture(state, &*map, Some(false), Some(source.axes.color_space))
        }
    };
    let Some(map_texture) = map_texture else {
        let passthrough = get_gl_effect_program(
            state,
            "spatial.bitmapDisplacement.passthrough",
            BITMAP_DISPLACEMENT_PASSTHROUGH_FRAGMENT_SRC,
        )?;
        return draw_gl_fullscreen_pass(
            state,
            &passthrough,
            &[source.texture],
            Some(dest),
            |_gl, _p| {},
        );
    };
    let map_is_render_target = effect.map.as_ref().is_some_and(|map| {
        map.read()
            .unwrap_or_else(PoisonError::into_inner)
            .source
            .as_ref()
            .is_some_and(|source| {
                source
                    .read()
                    .unwrap_or_else(PoisonError::into_inner)
                    .texture_source_fields()
                    .kind
                    == RENDER_TARGET_TEXTURE_SOURCE_KIND
            })
    });

    let program = get_gl_effect_program(
        state,
        "spatial.bitmapDisplacement",
        BITMAP_DISPLACEMENT_FRAGMENT_SRC,
    )?;
    let component_x = effect.component_x.unwrap_or(ImageChannel::Red) as i32;
    let component_y = effect.component_y.unwrap_or(ImageChannel::Green) as i32;
    let scale_x = effect.scale_x.unwrap_or(0.0);
    let scale_y = effect.scale_y.unwrap_or(0.0);
    let edge_mode = if effect.edge_mode == Some(BitmapDisplacementEffectEdgeMode::Clamp) {
        0
    } else {
        1
    };
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;

    let component_x_loc = get_gl_effect_uniform_location(state, &program, "u_componentX");
    let component_y_loc = get_gl_effect_uniform_location(state, &program, "u_componentY");
    let edge_mode_loc = get_gl_effect_uniform_location(state, &program, "u_edgeMode");
    let map_is_render_target_loc =
        get_gl_effect_uniform_location(state, &program, "u_mapIsRenderTarget");
    let resolution_loc = get_gl_effect_uniform_location(state, &program, "u_resolution");
    let scale_loc = get_gl_effect_uniform_location(state, &program, "u_scale");
    return draw_gl_fullscreen_pass(
        state,
        &program,
        &[source.texture, map_texture],
        Some(dest),
        |gl, _p| {
            if component_x_loc.is_some() {
                set_uniform_1i(gl, component_x_loc.as_ref(), component_x);
            }
            if component_y_loc.is_some() {
                set_uniform_1i(gl, component_y_loc.as_ref(), component_y);
            }
            if edge_mode_loc.is_some() {
                set_uniform_1i(gl, edge_mode_loc.as_ref(), edge_mode);
            }
            if map_is_render_target_loc.is_some() {
                set_uniform_1i(
                    gl,
                    map_is_render_target_loc.as_ref(),
                    if map_is_render_target { 1 } else { 0 },
                );
            }
            if resolution_loc.is_some() {
                set_uniform_2f(gl, resolution_loc.as_ref(), width, height);
            }
            if scale_loc.is_some() {
                set_uniform_2f(gl, scale_loc.as_ref(), scale_x, scale_y);
            }
        },
    );
}

pub fn gl_bitmap_displacement_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<BitmapDisplacementEffect>() else {
        return Ok(());
    };
    return apply_bitmap_displacement_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

/// Whether this BitmapDisplacementEffect names a map that resolves to a GL texture. An effect that
/// does not still RUNS — it copies the input through unchanged.
pub fn is_gl_bitmap_displacement_effect_resolvable(
    state: &mut GlRenderState,
    effect: &dyn Effect,
) -> bool {
    let Some(effect) = effect.as_any().downcast_ref::<BitmapDisplacementEffect>() else {
        return false;
    };
    let Some(map) = &effect.map else {
        return false;
    };
    let map = map.read().unwrap_or_else(PoisonError::into_inner);
    let color_space = if map.texture_fields().color_space == TextureColorSpace::Linear {
        RenderTargetColorSpace::Linear
    } else {
        RenderTargetColorSpace::Srgb
    };
    return resolve_gl_texture(state, &*map, Some(false), Some(color_space)).is_some();
}

pub fn register_gl_bitmap_displacement_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "BitmapDisplacementEffect",
        gl_bitmap_displacement_effect_runner,
        Some(is_gl_bitmap_displacement_effect_resolvable),
    );
}
