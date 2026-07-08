import { getCameraInverseViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix4 } from '@flighthq/geometry';
import { createGlProgram } from '@flighthq/render-gl';
import type { Camera, Environment, GlRenderState, Matrix4 } from '@flighthq/types';

import { ensureGlEnvironmentSourceCube } from './glEnvironmentCube';

// Draws the environment's radiance cubemap as the scene backdrop: a screen-filling pass that, per
// pixel, reconstructs the world-space view ray from the inverse view-projection and samples the cube.
// The quad is emitted at the far plane (clip z = w) with depth writes off, so it fills only pixels the
// opaque scene has not yet covered and never occludes geometry. Call it once, after the color target
// is bound and cleared and before drawGlScene. A no-op when the environment has no complete source
// cube. `aspect` is the viewport width / height (matches the camera aspect drawGlScene uses).
export function drawGlEnvironmentSkybox(
  state: GlRenderState,
  environment: Readonly<Environment>,
  camera: Readonly<Camera>,
  aspect: number,
): void {
  const cube = ensureGlEnvironmentSourceCube(state, environment);
  if (cube === null) return;

  const gl = state.gl;
  const sky = ensureGlSkybox(state);

  getCameraInverseViewProjectionMatrix4(_inverseViewProjection, camera, aspect);

  const prevDepthTest = gl.getParameter(gl.DEPTH_TEST) as boolean;
  gl.depthMask(false);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  gl.useProgram(sky.program);
  gl.uniformMatrix4fv(sky.locInverseViewProjection, false, _inverseViewProjection.m);
  gl.uniform1f(sky.locIntensity, environment.intensity);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
  gl.uniform1i(sky.locEnvCube, 0);

  gl.bindVertexArray(sky.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);

  gl.depthMask(true);
  if (prevDepthTest) gl.enable(gl.DEPTH_TEST);
}

interface GlSkybox {
  locEnvCube: WebGLUniformLocation | null;
  locInverseViewProjection: WebGLUniformLocation | null;
  locIntensity: WebGLUniformLocation | null;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
}

function ensureGlSkybox(state: GlRenderState): GlSkybox {
  const gl = state.gl;
  let sky = _skyboxes.get(state);
  if (sky !== undefined) return sky;

  const program = linkGlSkyboxProgram(gl);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, _quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  sky = {
    locEnvCube: gl.getUniformLocation(program, 'u_envCube'),
    locInverseViewProjection: gl.getUniformLocation(program, 'u_inverseViewProjection'),
    locIntensity: gl.getUniformLocation(program, 'u_intensity'),
    program,
    vao,
  };
  _skyboxes.set(state, sky);
  return sky;
}

function linkGlSkyboxProgram(gl: WebGL2RenderingContext): WebGLProgram {
  return createGlProgram(gl, SKYBOX_VERTEX, SKYBOX_FRAGMENT, 'Skybox');
}

const _inverseViewProjection: Matrix4 = createMatrix4();
const _quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const _skyboxes = new WeakMap<GlRenderState, GlSkybox>();

const SKYBOX_VERTEX = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_ndc;
void main() {
  v_ndc = a_position;
  // Emit at the far plane (z = w) so the backdrop sits behind every drawn fragment.
  gl_Position = vec4(a_position, 1.0, 1.0);
}
`;

const SKYBOX_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_ndc;
uniform samplerCube u_envCube;
uniform mat4 u_inverseViewProjection;
uniform float u_intensity;
out vec4 fragColor;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void main() {
  // Reconstruct the world-space ray through this pixel from the near- and far-plane unprojections.
  vec4 nearW = u_inverseViewProjection * vec4(v_ndc, -1.0, 1.0);
  vec4 farW = u_inverseViewProjection * vec4(v_ndc, 1.0, 1.0);
  vec3 dir = normalize(farW.xyz / farW.w - nearW.xyz / nearW.w);
  vec3 color = srgbToLinear(texture(u_envCube, dir).rgb) * u_intensity;
  fragColor = vec4(color, 1.0);
}
`;
