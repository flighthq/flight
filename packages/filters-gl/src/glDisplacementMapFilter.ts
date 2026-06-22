import type { GlRenderTarget } from '@flighthq/render-gl';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { DisplacementMapFilter, GlFullscreenProgram, GlRenderState } from '@flighthq/types';

// Samples the map (unit 1) to compute per-pixel UV displacement, then samples
// the source (unit 0) at the displaced coordinate. Map value 0.5 (128/255)
// is neutral (no displacement).
const DISPLACEMENT_MAP_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec2 u_texelSize;
uniform int u_componentX;
uniform int u_componentY;
uniform float u_scaleX;
uniform float u_scaleY;
uniform int u_mode;
uniform vec4 u_edgeColor;
out vec4 fragColor;

float getChannel(vec4 color, int comp) {
  if (comp == 0) return color.r;
  if (comp == 1) return color.g;
  if (comp == 2) return color.b;
  return color.a;
}

vec4 sampleSource(vec2 uv) {
  if (u_mode == 0) {
    // wrap
    return texture(u_texture0, fract(uv));
  }
  if (u_mode == 1) {
    // clamp
    return texture(u_texture0, clamp(uv, vec2(0.0), vec2(1.0)));
  }
  if (u_mode == 2) {
    // ignore — return transparent if out-of-bounds
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
    return texture(u_texture0, uv);
  }
  // color
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return u_edgeColor;
  return texture(u_texture0, uv);
}

void main() {
  vec4 mapSample = texture(u_texture1, v_texCoord);
  float mx = getChannel(mapSample, u_componentX);
  float my = getChannel(mapSample, u_componentY);
  vec2 offset = vec2((mx - 0.5) * u_scaleX, (my - 0.5) * u_scaleY) * u_texelSize;
  fragColor = sampleSource(v_texCoord + offset);
}`;

type DisplacementMapShaderLocations = GlFullscreenProgram & {
  locTexelSize: WebGLUniformLocation;
  locComponentX: WebGLUniformLocation;
  locComponentY: WebGLUniformLocation;
  locScaleX: WebGLUniformLocation;
  locScaleY: WebGLUniformLocation;
  locMode: WebGLUniformLocation;
  locEdgeColor: WebGLUniformLocation;
};

const MODE_MAP: Record<string, number> = { wrap: 0, clamp: 1, ignore: 2, color: 3 };

const shaders = new WeakMap<GlRenderState, DisplacementMapShaderLocations>();

/**
 * Applies a displacement map warp to `source`, writing to `dest`. `map` supplies
 * the per-pixel displacement vectors; channels are selected by `filter.componentX`
 * and `filter.componentY` (0=R, 1=G, 2=B, 3=A). A single GPU pass — no scratch
 * targets needed.
 */
export function applyDisplacementMapFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  map: GlRenderTarget,
  dest: GlRenderTarget,
  filter: Readonly<Omit<DisplacementMapFilter, 'kind'>>,
): void {
  const mode = MODE_MAP[filter.mode ?? 'wrap'] ?? 0;
  const edgeColor = filter.color ?? 0;
  const edgeAlpha = filter.alpha ?? 0;

  const loc = getShader(state);
  drawGlFullscreenPass(state, loc, [source.texture, map.texture], dest, (gl) => {
    gl.uniform2f(loc.locTexelSize, 1 / source.width, 1 / source.height);
    gl.uniform1i(loc.locComponentX, filter.componentX ?? 0);
    gl.uniform1i(loc.locComponentY, filter.componentY ?? 1);
    gl.uniform1f(loc.locScaleX, filter.scaleX ?? 0);
    gl.uniform1f(loc.locScaleY, filter.scaleY ?? 0);
    gl.uniform1i(loc.locMode, mode);
    gl.uniform4f(
      loc.locEdgeColor,
      ((edgeColor >> 16) & 0xff) / 255,
      ((edgeColor >> 8) & 0xff) / 255,
      (edgeColor & 0xff) / 255,
      edgeAlpha,
    );
  });
}

function getShader(state: GlRenderState): DisplacementMapShaderLocations {
  let loc = shaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, DISPLACEMENT_MAP_FRAGMENT_SRC);
    loc = {
      ...base,
      locTexelSize: gl.getUniformLocation(base.program, 'u_texelSize')!,
      locComponentX: gl.getUniformLocation(base.program, 'u_componentX')!,
      locComponentY: gl.getUniformLocation(base.program, 'u_componentY')!,
      locScaleX: gl.getUniformLocation(base.program, 'u_scaleX')!,
      locScaleY: gl.getUniformLocation(base.program, 'u_scaleY')!,
      locMode: gl.getUniformLocation(base.program, 'u_mode')!,
      locEdgeColor: gl.getUniformLocation(base.program, 'u_edgeColor')!,
    };
    shaders.set(state, loc);
  }
  return loc;
}
