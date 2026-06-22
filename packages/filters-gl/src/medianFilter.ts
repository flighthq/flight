import type { GlRenderTarget } from '@flighthq/render-gl';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { MedianFilter } from '@flighthq/types';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types';

// Supports radius up to 2 (5×5 = 25 samples). For larger radii use the
// surface path. Sorts per-channel independently using insertion sort.
const MAX_RADIUS = 2;
const MAX_SAMPLES = (MAX_RADIUS * 2 + 1) * (MAX_RADIUS * 2 + 1); // 25

const MEDIAN_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform int u_radius;
out vec4 fragColor;

const int MAX_S = ${MAX_SAMPLES};

void sortFloat(inout float arr[MAX_S], int n) {
  for (int i = 1; i < n; i++) {
    float key = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
}

void main() {
  int r = clamp(u_radius, 0, ${MAX_RADIUS});
  if (r == 0) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  int n = (2 * r + 1) * (2 * r + 1);
  float rv[MAX_S];
  float gv[MAX_S];
  float bv[MAX_S];
  float av[MAX_S];
  int count = 0;
  for (int dy = -${MAX_RADIUS}; dy <= ${MAX_RADIUS}; dy++) {
    for (int dx = -${MAX_RADIUS}; dx <= ${MAX_RADIUS}; dx++) {
      if (abs(dy) <= r && abs(dx) <= r) {
        vec4 s = texture(u_texture, v_texCoord + vec2(float(dx), float(dy)) * u_texelSize);
        rv[count] = s.r;
        gv[count] = s.g;
        bv[count] = s.b;
        av[count] = s.a;
        count++;
      }
    }
  }
  sortFloat(rv, n);
  sortFloat(gv, n);
  sortFloat(bv, n);
  sortFloat(av, n);
  int mid = n / 2;
  fragColor = vec4(rv[mid], gv[mid], bv[mid], av[mid]);
}`;

type MedianShaderLocations = GlFullscreenProgram & {
  locTexelSize: WebGLUniformLocation;
  locRadius: WebGLUniformLocation;
};

const shaders = new WeakMap<GlRenderState, MedianShaderLocations>();

/**
 * Applies a per-channel median filter to `source`, writing to `dest`.
 * Preserves edges while removing noise. Supports radius 0–2 (up to 5×5);
 * use `applyMedianFilterToSurface` for larger radii.
 * A single GPU pass — no scratch targets needed.
 */
export function applyMedianFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  filter: Readonly<Omit<MedianFilter, 'type'>>,
): void {
  const radius = Math.min(MAX_RADIUS, Math.max(0, Math.round(filter.radius ?? 1)));
  const loc = getShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locTexelSize, 1 / source.width, 1 / source.height);
    gl.uniform1i(loc.locRadius, radius);
  });
}

function getShader(state: GlRenderState): MedianShaderLocations {
  let loc = shaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, MEDIAN_FRAGMENT_SRC);
    loc = {
      ...base,
      locTexelSize: gl.getUniformLocation(base.program, 'u_texelSize')!,
      locRadius: gl.getUniformLocation(base.program, 'u_radius')!,
    };
    shaders.set(state, loc);
  }
  return loc;
}
