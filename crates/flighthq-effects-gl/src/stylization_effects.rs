//! GL stylization effect recipes.
//!
//! Non-photoreal looks: film grain, digital glitch, scanlines, CRT, pixelate,
//! halftone, dithering, outline detection, unsharp-mask sharpening, Kuwahara
//! oil-paint filter, and pencil sketch.  Neighbor-sampling shaders receive
//! `u_resolution` as the source pixel size so texel steps are exact; outline's
//! packed RGBA color is unpacked before upload.
//!
//! Mirrors the TS `stylizationEffects` from `effects-webgl`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{
    CrtEffect, DitherEffect, FilmGrainEffect, GlitchEffect, HalftoneEffect, KuwaharaEffect,
    OutlineEffect, PixelateEffect, ScanlinesEffect, SharpenEffect, SketchEffect,
};
use flighthq_render_gl::render_state::{GlRenderState, GlRenderTarget};
use glow::HasContext;

use crate::effect_program_cache::{draw_gl_effect_fullscreen_pass, get_gl_effect_program};
use crate::render_effect_registry::{GlRenderEffectContext, GlRenderEffectRunner};

// ---------------------------------------------------------------------------
// Recipe functions
// ---------------------------------------------------------------------------

/// Applies CRT simulation to `source` and writes to `dest`.
pub fn apply_crt_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &CrtEffect,
) {
    let curvature = effect.curvature.unwrap_or(0.1);
    let scanline_intensity = effect.scanline_intensity.unwrap_or(0.3);
    let vignette = effect.vignette.unwrap_or(0.3);
    let aberration = effect.aberration.unwrap_or(0.005);
    let width = source.width as f32;
    let height = source.height as f32;
    let program = get_gl_effect_program(state, "stylization.crt", CRT_FRAGMENT_SRC) as *const _;
    // SAFETY: the program is boxed in the per-state cache and stays live and
    // pinned while `state` is borrowed, so the pointer is valid for this draw.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_curvature").as_ref(),
                curvature,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_scanlineIntensity").as_ref(),
                scanline_intensity,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_vignette").as_ref(), vignette);
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_aberration").as_ref(),
                aberration,
            );
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies ordered dithering to `source` and writes to `dest`.
pub fn apply_dither_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &DitherEffect,
) {
    let levels = (effect.levels.unwrap_or(4).max(2)) as f32;
    let width = source.width as f32;
    let height = source.height as f32;
    let program =
        get_gl_effect_program(state, "stylization.dither", DITHER_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_levels").as_ref(), levels);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies animated film grain to `source` and writes to `dest`.
pub fn apply_film_grain_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &FilmGrainEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.1);
    let size = effect.size.unwrap_or(1.0).max(0.0001);
    let seed = effect.seed.unwrap_or(0.0);
    let program =
        get_gl_effect_program(state, "stylization.filmGrain", FILM_GRAIN_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_size").as_ref(), size);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_seed").as_ref(), seed);
        },
    );
}

/// Applies digital glitch (block tears + channel split + corruption) to
/// `source` and writes to `dest`.
pub fn apply_glitch_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &GlitchEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.5);
    let block_size = effect.block_size.unwrap_or(24.0);
    let color_shift = effect.color_shift.unwrap_or(8.0);
    let seed = effect.seed.unwrap_or(0.0);
    let width = source.width as f32;
    let height = source.height as f32;
    let program =
        get_gl_effect_program(state, "stylization.glitch", GLITCH_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_blockSize").as_ref(),
                block_size,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_colorShift").as_ref(),
                color_shift,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_seed").as_ref(), seed);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies halftone dot pattern to `source` and writes to `dest`.
pub fn apply_halftone_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &HalftoneEffect,
) {
    let scale = effect.scale.unwrap_or(6.0).max(1.0);
    let angle = effect.angle.unwrap_or(0.4);
    let width = source.width as f32;
    let height = source.height as f32;
    let program =
        get_gl_effect_program(state, "stylization.halftone", HALFTONE_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_scale").as_ref(), scale);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_angle").as_ref(), angle);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies Kuwahara oil-paint filter to `source` and writes to `dest`.
pub fn apply_kuwahara_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &KuwaharaEffect,
) {
    let radius = (effect.radius.unwrap_or(3).max(1)) as f32;
    let width = source.width as f32;
    let height = source.height as f32;
    let program =
        get_gl_effect_program(state, "stylization.kuwahara", KUWAHARA_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_radius").as_ref(), radius);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies edge outline to `source` and writes to `dest`.
pub fn apply_outline_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &OutlineEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.2);
    let thickness = effect.thickness.unwrap_or(1.0);
    let color = effect.color.unwrap_or(0x000000ff);
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0;
    let width = source.width as f32;
    let height = source.height as f32;
    let program =
        get_gl_effect_program(state, "stylization.outline", OUTLINE_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_threshold").as_ref(),
                threshold,
            );
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_thickness").as_ref(),
                thickness,
            );
            gl.uniform_4_f32(gl.get_uniform_location(p, "u_color").as_ref(), r, g, b, a);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies pixelation to `source` and writes to `dest`.
pub fn apply_pixelate_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &PixelateEffect,
) {
    let size = effect.size.unwrap_or(8.0).max(1.0);
    let width = source.width as f32;
    let height = source.height as f32;
    let program =
        get_gl_effect_program(state, "stylization.pixelate", PIXELATE_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_size").as_ref(), size);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies horizontal scanlines to `source` and writes to `dest`.
pub fn apply_scanlines_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &ScanlinesEffect,
) {
    let count = effect.count.unwrap_or(240.0);
    let intensity = effect.intensity.unwrap_or(0.3);
    let program =
        get_gl_effect_program(state, "stylization.scanlines", SCANLINES_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_count").as_ref(), count);
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
        },
    );
}

/// Applies unsharp-mask sharpening to `source` and writes to `dest`.
pub fn apply_sharpen_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &SharpenEffect,
) {
    let amount = effect.amount.unwrap_or(0.5);
    let width = source.width as f32;
    let height = source.height as f32;
    let program =
        get_gl_effect_program(state, "stylization.sharpen", SHARPEN_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_amount").as_ref(), amount);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies pencil-sketch stylization to `source` and writes to `dest`.
pub fn apply_sketch_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &SketchEffect,
) {
    let strength = effect.strength.unwrap_or(1.0);
    let width = source.width as f32;
    let height = source.height as f32;
    let program =
        get_gl_effect_program(state, "stylization.sketch", SKETCH_FRAGMENT_SRC) as *const _;
    // SAFETY: see `apply_crt_effect_to_gl`.
    let program = unsafe { &*program };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_strength").as_ref(), strength);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

// ---------------------------------------------------------------------------
// Default runners
// ---------------------------------------------------------------------------

/// Default GL runner for [`CrtEffect`].
pub const DEFAULT_GL_CRT_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Crt(effect) = effect {
            // SAFETY: the pipeline guarantees `state` is disjoint from `source`/`dest`
            // for the duration of the call; reborrow the `&mut` field through the
            // shared context.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_crt_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`DitherEffect`].
pub const DEFAULT_GL_DITHER_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Dither(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_dither_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`FilmGrainEffect`].
pub const DEFAULT_GL_FILM_GRAIN_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::FilmGrain(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_film_grain_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`GlitchEffect`].
pub const DEFAULT_GL_GLITCH_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Glitch(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_glitch_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`HalftoneEffect`].
pub const DEFAULT_GL_HALFTONE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Halftone(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_halftone_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`KuwaharaEffect`].
pub const DEFAULT_GL_KUWAHARA_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Kuwahara(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_kuwahara_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`OutlineEffect`].
pub const DEFAULT_GL_OUTLINE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Outline(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_outline_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`PixelateEffect`].
pub const DEFAULT_GL_PIXELATE_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Pixelate(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_pixelate_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`ScanlinesEffect`].
pub const DEFAULT_GL_SCANLINES_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Scanlines(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_scanlines_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`SharpenEffect`].
pub const DEFAULT_GL_SHARPEN_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Sharpen(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_sharpen_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`SketchEffect`].
pub const DEFAULT_GL_SKETCH_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Sketch(effect) = effect {
            // SAFETY: see `DEFAULT_GL_CRT_EFFECT_RUNNER`.
            let state = unsafe { &mut *(ctx.state as *const GlRenderState as *mut GlRenderState) };
            apply_sketch_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

// ---------------------------------------------------------------------------
// Fragment sources
// ---------------------------------------------------------------------------

// CRT: barrel-distort the uv, darken alternating scanlines, vignette the edges,
// and split the channels outward (chromatic aberration).
const CRT_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_vignette;
uniform float u_aberration;
uniform vec2 u_resolution;
out vec4 o_color;
vec2 barrel(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c += c * u_curvature * dot(c, c);
  return c * 0.5 + 0.5;
}
void main() {
  vec2 uv = barrel(v_texCoord);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 off = vec2(u_aberration, 0.0);
  float r = texture(u_texture0, uv + off).r;
  float g = texture(u_texture0, uv).g;
  float b = texture(u_texture0, uv - off).b;
  float a = texture(u_texture0, uv).a;
  vec3 col = vec3(r, g, b);
  float line = sin(uv.y * u_resolution.y * 3.14159265) * 0.5 + 0.5;
  col *= 1.0 - u_scanlineIntensity * (1.0 - line);
  vec2 vc = uv * 2.0 - 1.0;
  col *= 1.0 - u_vignette * dot(vc, vc);
  o_color = vec4(col, a);
}";

// Dither: quantize each channel to `levels` steps with a 4x4 ordered Bayer threshold.
const DITHER_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_levels;
uniform vec2 u_resolution;
out vec4 o_color;
float bayer(ivec2 p) {
  int x = p.x & 3;
  int y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[y * 4 + x]) / 16.0;
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  ivec2 px = ivec2(v_texCoord * u_resolution);
  float t = bayer(px) - 0.5;
  float steps = u_levels - 1.0;
  vec3 q = floor(c.rgb * steps + 0.5 + t) / steps;
  o_color = vec4(clamp(q, 0.0, 1.0), c.a);
}";

// Film grain: add per-pixel hash noise scaled by intensity, with cell size and a seed.
const FILM_GRAIN_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_size;
uniform float u_seed;
out vec4 o_color;
float hash(vec2 p) {
  p = floor(p / u_size);
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453123);
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float n = hash(v_texCoord * 1024.0) - 0.5;
  o_color = vec4(c.rgb + n * u_intensity, c.a);
}";

// Glitch: block tears + RGB channel split + occasional block corruption; `seed` animates it.
const GLITCH_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_blockSize;
uniform float u_colorShift;
uniform float u_seed;
uniform vec2 u_resolution;
out vec4 o_color;
float ghash(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  float blockSize = max(2.0, u_blockSize);
  float block = floor(v_texCoord.y * u_resolution.y / blockSize);
  float r = ghash(block + u_seed * 7.0);
  float tear = step(1.0 - u_intensity * 0.6, r);
  float shiftPx = (ghash(block * 1.7 + u_seed) - 0.5) * 2.0 * tear * u_intensity * 40.0;
  vec2 baseUv = vec2(v_texCoord.x + shiftPx / u_resolution.x, v_texCoord.y);
  float cs = (u_colorShift * (0.4 + tear)) / u_resolution.x;
  float rC = texture(u_texture0, vec2(baseUv.x + cs, baseUv.y)).r;
  float gC = texture(u_texture0, baseUv).g;
  float bC = texture(u_texture0, vec2(baseUv.x - cs, baseUv.y)).b;
  float a = texture(u_texture0, baseUv).a;
  vec3 col = vec3(rC, gC, bC);
  float corrupt = step(0.985 - u_intensity * 0.04, ghash(block * 3.3 + u_seed * 2.0));
  col = mix(col, vec3(1.0), corrupt * 0.6);
  o_color = vec4(col, a);
}";

// Halftone: sample luminance, then carve a rotated dot grid whose dot radius tracks darkness.
const HALFTONE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_scale;
uniform float u_angle;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec2 p = v_texCoord * u_resolution;
  float s = sin(u_angle), co = cos(u_angle);
  vec2 rp = vec2(p.x * co - p.y * s, p.x * s + p.y * co);
  vec2 cell = mod(rp, u_scale) - u_scale * 0.5;
  float dist = length(cell) / (u_scale * 0.5);
  float radius = sqrt(1.0 - lum);
  float dot1 = step(dist, radius);
  o_color = vec4(c.rgb * dot1, c.a);
}";

// Kuwahara: edge-preserving smoothing — emit the lowest-variance quadrant mean.
const KUWAHARA_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_radius;
uniform vec2 u_resolution;
out vec4 o_color;
const int R = 4;
void main() {
  vec2 texel = 1.0 / u_resolution;
  int r = int(min(float(R), u_radius));
  vec3 means[4];
  float vars[4];
  ivec2 lo[4] = ivec2[4](ivec2(-1, -1), ivec2(0, -1), ivec2(-1, 0), ivec2(0, 0));
  for (int q = 0; q < 4; q++) {
    vec3 sum = vec3(0.0);
    vec3 sumSq = vec3(0.0);
    float n = 0.0;
    for (int y = 0; y <= R; y++) {
      for (int x = 0; x <= R; x++) {
        if (x > r || y > r) continue;
        ivec2 d = ivec2(x, y) * sign(lo[q] + ivec2(1)) + lo[q] * r;
        vec2 off = vec2(float(d.x), float(d.y)) * texel;
        vec3 col = texture(u_texture0, v_texCoord + off).rgb;
        sum += col;
        sumSq += col * col;
        n += 1.0;
      }
    }
    vec3 mean = sum / n;
    means[q] = mean;
    vec3 v = sumSq / n - mean * mean;
    vars[q] = v.r + v.g + v.b;
  }
  float minVar = vars[0];
  vec3 result = means[0];
  for (int q = 1; q < 4; q++) {
    if (vars[q] < minVar) {
      minVar = vars[q];
      result = means[q];
    }
  }
  o_color = vec4(result, texture(u_texture0, v_texCoord).a);
}";

// Outline: Sobel edge detection on luminance, mixed toward the unpacked outline color.
const OUTLINE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
uniform float u_thickness;
uniform vec4 u_color;
uniform vec2 u_resolution;
out vec4 o_color;
float lum(vec2 uv) {
  return dot(texture(u_texture0, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  vec2 texel = u_thickness / u_resolution;
  float tl = lum(v_texCoord + texel * vec2(-1.0, -1.0));
  float t = lum(v_texCoord + texel * vec2(0.0, -1.0));
  float tr = lum(v_texCoord + texel * vec2(1.0, -1.0));
  float l = lum(v_texCoord + texel * vec2(-1.0, 0.0));
  float rr = lum(v_texCoord + texel * vec2(1.0, 0.0));
  float bl = lum(v_texCoord + texel * vec2(-1.0, 1.0));
  float b = lum(v_texCoord + texel * vec2(0.0, 1.0));
  float br = lum(v_texCoord + texel * vec2(1.0, 1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);
  vec4 c = texture(u_texture0, v_texCoord);
  float k = step(u_threshold, edge);
  o_color = mix(c, u_color, k * u_color.a);
}";

// Pixelate: snap uv to the center of `size`-pixel blocks before sampling.
const PIXELATE_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_size;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 blocks = u_resolution / u_size;
  vec2 uv = (floor(v_texCoord * blocks) + 0.5) / blocks;
  o_color = texture(u_texture0, uv);
}";

// Scanlines: darken by a vertical sine band.
const SCANLINES_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_count;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float line = sin(v_texCoord.y * u_count * 3.14159265) * 0.5 + 0.5;
  o_color = vec4(c.rgb * (1.0 - u_intensity * (1.0 - line)), c.a);
}";

// Sharpen: unsharp mask via a 3x3 Laplacian kernel.
const SHARPEN_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_amount;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec3 c = texture(u_texture0, v_texCoord).rgb;
  vec3 n = texture(u_texture0, v_texCoord + vec2(0.0, -texel.y)).rgb;
  vec3 s = texture(u_texture0, v_texCoord + vec2(0.0, texel.y)).rgb;
  vec3 e = texture(u_texture0, v_texCoord + vec2(texel.x, 0.0)).rgb;
  vec3 w = texture(u_texture0, v_texCoord + vec2(-texel.x, 0.0)).rgb;
  vec3 high = c * 4.0 - n - s - e - w;
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(clamp(c + high * u_amount, 0.0, 1.0), a);
}";

// Sketch: detect luminance edges and invert them into dark pencil strokes over a light page.
const SKETCH_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_strength;
uniform vec2 u_resolution;
out vec4 o_color;
float lum(vec2 uv) {
  return dot(texture(u_texture0, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  float tl = lum(v_texCoord + texel * vec2(-1.0, -1.0));
  float t = lum(v_texCoord + texel * vec2(0.0, -1.0));
  float tr = lum(v_texCoord + texel * vec2(1.0, -1.0));
  float l = lum(v_texCoord + texel * vec2(-1.0, 0.0));
  float rr = lum(v_texCoord + texel * vec2(1.0, 0.0));
  float bl = lum(v_texCoord + texel * vec2(-1.0, 1.0));
  float b = lum(v_texCoord + texel * vec2(0.0, 1.0));
  float br = lum(v_texCoord + texel * vec2(1.0, 1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);
  float pencil = clamp(1.0 - edge * u_strength, 0.0, 1.0);
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(vec3(pencil), a);
}";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crt_fragment_barrel_distorts_and_scanlines() {
        assert!(CRT_FRAGMENT_SRC.contains("vec2 barrel(vec2 uv)"));
        assert!(CRT_FRAGMENT_SRC.contains("uniform float u_scanlineIntensity"));
        assert!(CRT_FRAGMENT_SRC.contains("uniform float u_aberration"));
    }

    #[test]
    fn dither_fragment_uses_bayer_matrix() {
        assert!(DITHER_FRAGMENT_SRC.contains("int[16](0, 8, 2, 10"));
        assert!(DITHER_FRAGMENT_SRC.contains("uniform float u_levels"));
    }

    #[test]
    fn film_grain_fragment_hashes_seeded_noise() {
        assert!(FILM_GRAIN_FRAGMENT_SRC.contains("uniform float u_seed"));
        assert!(FILM_GRAIN_FRAGMENT_SRC.contains("43758.5453123"));
    }

    #[test]
    fn glitch_fragment_declares_block_tear_uniforms() {
        assert!(GLITCH_FRAGMENT_SRC.contains("uniform float u_blockSize"));
        assert!(GLITCH_FRAGMENT_SRC.contains("uniform float u_colorShift"));
        assert!(GLITCH_FRAGMENT_SRC.contains("float tear = step"));
    }

    #[test]
    fn halftone_fragment_rotates_dot_grid() {
        assert!(HALFTONE_FRAGMENT_SRC.contains("uniform float u_angle"));
        assert!(HALFTONE_FRAGMENT_SRC.contains("uniform float u_scale"));
        assert!(HALFTONE_FRAGMENT_SRC.contains("float radius = sqrt(1.0 - lum)"));
    }

    #[test]
    fn kuwahara_fragment_picks_lowest_variance_quadrant() {
        assert!(KUWAHARA_FRAGMENT_SRC.contains("uniform float u_radius"));
        assert!(KUWAHARA_FRAGMENT_SRC.contains("float minVar"));
        assert!(KUWAHARA_FRAGMENT_SRC.contains("ivec2 lo[4]"));
    }

    #[test]
    fn outline_fragment_runs_sobel_against_color() {
        assert!(OUTLINE_FRAGMENT_SRC.contains("uniform vec4 u_color"));
        assert!(OUTLINE_FRAGMENT_SRC.contains("uniform float u_threshold"));
        // Sobel kernel weights present.
        assert!(OUTLINE_FRAGMENT_SRC.contains("2.0 * l"));
    }

    #[test]
    fn pixelate_fragment_snaps_to_blocks() {
        assert!(PIXELATE_FRAGMENT_SRC.contains("uniform float u_size"));
        assert!(PIXELATE_FRAGMENT_SRC.contains("vec2 blocks = u_resolution / u_size"));
    }

    #[test]
    fn scanlines_fragment_modulates_sine_band() {
        assert!(SCANLINES_FRAGMENT_SRC.contains("uniform float u_count"));
        assert!(SCANLINES_FRAGMENT_SRC.contains("uniform float u_intensity"));
    }

    #[test]
    fn sharpen_fragment_applies_laplacian_kernel() {
        assert!(SHARPEN_FRAGMENT_SRC.contains("uniform float u_amount"));
        assert!(SHARPEN_FRAGMENT_SRC.contains("vec3 high = c * 4.0 - n - s - e - w"));
    }

    #[test]
    fn sketch_fragment_inverts_edges_to_pencil() {
        assert!(SKETCH_FRAGMENT_SRC.contains("uniform float u_strength"));
        assert!(SKETCH_FRAGMENT_SRC.contains("float pencil = clamp(1.0 - edge * u_strength"));
    }
}
