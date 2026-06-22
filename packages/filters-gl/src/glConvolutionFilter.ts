import type { GlRenderTarget } from '@flighthq/render-gl';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { ConvolutionFilter } from '@flighthq/types';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types';

// Max supported kernel: 7×7. Use the surface path for larger kernels.
const MAX_KERNEL = 49;

const CONVOLUTION_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_matrix[${MAX_KERNEL}];
uniform int u_matrixX;
uniform int u_matrixY;
uniform float u_divisor;
uniform float u_bias;
uniform bool u_clamp;
uniform bool u_preserveAlpha;
uniform vec4 u_edgeColor;
out vec4 fragColor;

vec4 sampleAt(vec2 uv) {
  if (u_clamp) {
    return texture(u_texture, clamp(uv, vec2(0.0), vec2(1.0)));
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return u_edgeColor;
  }
  return texture(u_texture, uv);
}

void main() {
  int offsetX = u_matrixX / 2;
  int offsetY = u_matrixY / 2;
  vec4 sum = vec4(0.0);
  for (int ky = 0; ky < u_matrixY; ky++) {
    for (int kx = 0; kx < u_matrixX; kx++) {
      float weight = u_matrix[ky * u_matrixX + kx];
      vec2 off = vec2(float(kx - offsetX), float(ky - offsetY)) * u_texelSize;
      sum += sampleAt(v_texCoord + off) * weight;
    }
  }
  sum /= u_divisor;
  sum += u_bias / 255.0;
  sum = clamp(sum, 0.0, 1.0);
  if (u_preserveAlpha) {
    float origAlpha = texture(u_texture, v_texCoord).a;
    vec3 straightRGB = (sum.a > 0.0) ? clamp(sum.rgb / sum.a, 0.0, 1.0) : vec3(0.0);
    sum = vec4(straightRGB * origAlpha, origAlpha);
  }
  fragColor = sum;
}`;

type ConvolutionShaderLocations = GlFullscreenProgram & {
  locTexelSize: WebGLUniformLocation;
  locMatrix: WebGLUniformLocation;
  locMatrixX: WebGLUniformLocation;
  locMatrixY: WebGLUniformLocation;
  locDivisor: WebGLUniformLocation;
  locBias: WebGLUniformLocation;
  locClamp: WebGLUniformLocation;
  locPreserveAlpha: WebGLUniformLocation;
  locEdgeColor: WebGLUniformLocation;
};

const shaders = new WeakMap<GlRenderState, ConvolutionShaderLocations>();

/**
 * Applies a convolution filter to `source`, writing to `dest`. Kernels larger
 * than 7×7 are not supported; use `applyConvolutionFilterToSurface` for those.
 */
export function applyConvolutionFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  filter: Readonly<Omit<ConvolutionFilter, 'kind'>>,
): void {
  const { matrix, matrixX, matrixY } = filter;
  if (matrixX <= 0 || matrixY <= 0) throw new Error('Convolution matrix dimensions must be positive');
  if (matrixX * matrixY > MAX_KERNEL)
    throw new Error(`Convolution kernel exceeds the WebGL maximum of 7×7 (${matrixX}×${matrixY} given)`);
  if (matrix.length < matrixX * matrixY) throw new Error('Convolution matrix does not match its declared dimensions');

  const bias = filter.bias ?? 0;
  const clampEdge = filter.clamp ?? true;
  const preserveAlpha = filter.preserveAlpha ?? true;
  const edgeColor = filter.color ?? 0;
  const divisor = filter.divisor ?? getAutoDiv(matrix, matrixX * matrixY);

  const matrixData = new Float32Array(MAX_KERNEL);
  for (let i = 0; i < matrixX * matrixY; i++) matrixData[i] = matrix[i];

  const loc = getShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locTexelSize, 1 / source.width, 1 / source.height);
    gl.uniform1fv(loc.locMatrix, matrixData);
    gl.uniform1i(loc.locMatrixX, matrixX);
    gl.uniform1i(loc.locMatrixY, matrixY);
    gl.uniform1f(loc.locDivisor, divisor);
    gl.uniform1f(loc.locBias, bias);
    gl.uniform1i(loc.locClamp, clampEdge ? 1 : 0);
    gl.uniform1i(loc.locPreserveAlpha, preserveAlpha ? 1 : 0);
    gl.uniform4f(
      loc.locEdgeColor,
      ((edgeColor >> 16) & 0xff) / 255,
      ((edgeColor >> 8) & 0xff) / 255,
      (edgeColor & 0xff) / 255,
      ((edgeColor >>> 24) & 0xff) / 255,
    );
  });
}

function getAutoDiv(matrix: ReadonlyArray<number>, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += matrix[i];
  return sum === 0 ? 1 : sum;
}

function getShader(state: GlRenderState): ConvolutionShaderLocations {
  let loc = shaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, CONVOLUTION_FRAGMENT_SRC);
    loc = {
      ...base,
      locTexelSize: gl.getUniformLocation(base.program, 'u_texelSize')!,
      locMatrix: gl.getUniformLocation(base.program, 'u_matrix[0]')!,
      locMatrixX: gl.getUniformLocation(base.program, 'u_matrixX')!,
      locMatrixY: gl.getUniformLocation(base.program, 'u_matrixY')!,
      locDivisor: gl.getUniformLocation(base.program, 'u_divisor')!,
      locBias: gl.getUniformLocation(base.program, 'u_bias')!,
      locClamp: gl.getUniformLocation(base.program, 'u_clamp')!,
      locPreserveAlpha: gl.getUniformLocation(base.program, 'u_preserveAlpha')!,
      locEdgeColor: gl.getUniformLocation(base.program, 'u_edgeColor')!,
    };
    shaders.set(state, loc);
  }
  return loc;
}
