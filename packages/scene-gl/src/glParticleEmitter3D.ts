import { getNodeRuntime, getNodeWorldTransformMatrix4 } from '@flighthq/node';
import { prepareSceneRender } from '@flighthq/render';
import { createGlProgram, invalidateGlRenderStateCache } from '@flighthq/render-gl';
import type {
  Camera,
  GlRenderState,
  Matrix4,
  NodeAny,
  ParticleEmitter3D,
  ParticleEmitterData,
  SceneLights,
  SceneNode,
} from '@flighthq/types';
import { ParticleEmitter3DKind } from '@flighthq/types';

// Per-instance layout (16 floats = 64 bytes):
// [0]  px         float   world x
// [1]  py         float   world y
// [2]  pz         float   world z
// [3]  cosScale   float   cos(rotation) * scale
// [4]  sinScale   float   sin(rotation) * scale
// [5]  r          float
// [6]  g          float
// [7]  b          float
// [8]  alpha      float
// [9]  u0         float
// [10] v0         float
// [11] u1         float
// [12] v1         float
// [13] width      float
// [14] height     float
// [15] _pad       float   (alignment to 64 bytes)
const INSTANCE_FLOATS = 16;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

const PARTICLE_TRANSFORM_STRIDE = 4;

const PARTICLE_3D_VS = `#version 300 es
precision highp float;

in vec2 a_corner;

layout(location = 1) in vec3  a_pos;
layout(location = 2) in float a_cosScale;
layout(location = 3) in float a_sinScale;
layout(location = 4) in vec4  a_color;
layout(location = 5) in vec4  a_uvRect;
layout(location = 6) in vec2  a_size;

uniform mat4 u_viewProjection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;

out vec2 v_uv;
out vec4 v_color;

void main() {
  float lx = (a_corner.x - 0.5) * a_size.x;
  float ly = (a_corner.y - 0.5) * a_size.y;
  float rx = a_cosScale * lx - a_sinScale * ly;
  float ry = a_sinScale * lx + a_cosScale * ly;
  vec3 worldPos = a_pos + u_cameraRight * rx + u_cameraUp * ry;
  gl_Position = u_viewProjection * vec4(worldPos, 1.0);
  v_uv    = mix(a_uvRect.xy, a_uvRect.zw, a_corner);
  v_color = a_color;
}`;

const PARTICLE_3D_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;
uniform int u_hasTexture;

out vec4 fragColor;

void main() {
  if (u_hasTexture != 0) {
    vec4 tex = texture(u_texture, v_uv);
    fragColor = vec4(tex.rgb * v_color.rgb, tex.a) * v_color.a;
  } else {
    fragColor = v_color;
  }
  if (fragColor.a <= 0.0) discard;
}`;

interface GlParticle3DShader {
  cornerBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  instanceData: Float32Array;
  locCameraRight: WebGLUniformLocation;
  locCameraUp: WebGLUniformLocation;
  locColor: number;
  locCorner: number;
  locCosScale: number;
  locHasTexture: WebGLUniformLocation;
  locPos: number;
  locSinScale: number;
  locSize: number;
  locTexture: WebGLUniformLocation;
  locUvRect: number;
  locViewProjection: WebGLUniformLocation;
  program: WebGLProgram;
}

function compileParticle3DShader(gl: WebGL2RenderingContext): GlParticle3DShader {
  const program = createGlProgram(gl, PARTICLE_3D_VS, PARTICLE_3D_FS, 'ParticleEmitter3D');

  const cornerData = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const cornerBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);

  const indexData = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const indexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

  const instanceBuffer = gl.createBuffer()!;

  return {
    cornerBuffer,
    indexBuffer,
    instanceBuffer,
    instanceData: new Float32Array(0),
    locCameraRight: gl.getUniformLocation(program, 'u_cameraRight')!,
    locCameraUp: gl.getUniformLocation(program, 'u_cameraUp')!,
    locColor: 4,
    locCorner: gl.getAttribLocation(program, 'a_corner'),
    locCosScale: 2,
    locHasTexture: gl.getUniformLocation(program, 'u_hasTexture')!,
    locPos: 1,
    locSinScale: 3,
    locSize: 6,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
    locUvRect: 5,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection')!,
    program,
  };
}

function ensureParticle3DShader(state: GlRenderState): GlParticle3DShader {
  let shader = shaderCache.get(state);
  if (shader !== undefined) return shader;
  shader = compileParticle3DShader(state.gl);
  shaderCache.set(state, shader);
  return shader;
}

function ensureInstanceCapacity(shader: GlParticle3DShader, gl: WebGL2RenderingContext, count: number): void {
  const needed = count * INSTANCE_FLOATS;
  if (shader.instanceData.length >= needed) return;
  const newSize = Math.max(needed, shader.instanceData.length * 2);
  shader.instanceData = new Float32Array(newSize);
  gl.bindBuffer(gl.ARRAY_BUFFER, shader.instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, newSize * 4, gl.DYNAMIC_DRAW);
}

function collectParticleEmitter3DNodes(node: Readonly<NodeAny>, out: ParticleEmitter3D[]): void {
  if (!node.enabled) return;
  if (node.kind === ParticleEmitter3DKind) {
    out.push(node as unknown as ParticleEmitter3D);
  }
  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      collectParticleEmitter3DNodes(children[i], out);
    }
  }
}

function drawParticleEmitter3DNode(
  gl: WebGL2RenderingContext,
  shader: GlParticle3DShader,
  emitter: Readonly<ParticleEmitter3D>,
): void {
  const data: Readonly<ParticleEmitterData> = emitter.data;
  const { alphas, atlas, colors, ids, particleCount, positionsZ, transforms } = data;
  if (particleCount === 0) return;

  ensureInstanceCapacity(shader, gl, particleCount);

  const hasAtlas = atlas !== null && atlas.image !== null && atlas.image.source !== null;
  const regions = hasAtlas ? atlas!.regions : null;
  const numRegions = regions !== null ? regions.length : 0;
  const iw = hasAtlas ? 1 / (atlas!.image!.width || 1) : 0;
  const ih = hasAtlas ? 1 / (atlas!.image!.height || 1) : 0;

  const worldMatrix = getNodeWorldTransformMatrix4(emitter as unknown as SceneNode) as Matrix4;
  const wm = worldMatrix.m;

  const instanceData = shader.instanceData;
  let base = 0;
  let drawCount = 0;

  for (let i = 0; i < particleCount; i++) {
    const tt = i * PARTICLE_TRANSFORM_STRIDE;
    const lx = transforms[tt];
    const ly = transforms[tt + 1];
    const rotation = transforms[tt + 2];
    const scale = transforms[tt + 3];
    const lz = positionsZ[i];

    const wx = wm[0] * lx + wm[4] * ly + wm[8] * lz + wm[12];
    const wy = wm[1] * lx + wm[5] * ly + wm[9] * lz + wm[13];
    const wz = wm[2] * lx + wm[6] * ly + wm[10] * lz + wm[14];

    const cosR = Math.cos(rotation) * scale;
    const sinR = Math.sin(rotation) * scale;

    const ct = i * 3;
    const hasColors = colors != null && colors.length > ct + 2;
    const r = hasColors ? colors[ct] : 1;
    const g = hasColors ? colors[ct + 1] : 1;
    const b = hasColors ? colors[ct + 2] : 1;

    let u0 = 0;
    let v0 = 0;
    let u1 = 1;
    let v1 = 1;
    let regionW = 1;
    let regionH = 1;

    if (regions !== null) {
      const id = ids[i];
      if (id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      u0 = region.x * iw;
      v0 = region.y * ih;
      u1 = (region.x + region.width) * iw;
      v1 = (region.y + region.height) * ih;
      regionW = region.width;
      regionH = region.height;
    }

    instanceData[base] = wx;
    instanceData[base + 1] = wy;
    instanceData[base + 2] = wz;
    instanceData[base + 3] = cosR;
    instanceData[base + 4] = sinR;
    instanceData[base + 5] = r;
    instanceData[base + 6] = g;
    instanceData[base + 7] = b;
    instanceData[base + 8] = alphas[i];
    instanceData[base + 9] = u0;
    instanceData[base + 10] = v0;
    instanceData[base + 11] = u1;
    instanceData[base + 12] = v1;
    instanceData[base + 13] = regionW;
    instanceData[base + 14] = regionH;
    instanceData[base + 15] = 0;
    base += INSTANCE_FLOATS;
    drawCount++;
  }

  if (drawCount === 0) return;

  gl.bindBuffer(gl.ARRAY_BUFFER, shader.instanceBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData, 0, drawCount * INSTANCE_FLOATS);

  gl.uniform1i(shader.locHasTexture, hasAtlas ? 1 : 0);
  if (hasAtlas) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.uniform1i(shader.locTexture, 0);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, shader.cornerBuffer);
  gl.enableVertexAttribArray(shader.locCorner);
  gl.vertexAttribPointer(shader.locCorner, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(shader.locCorner, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, shader.instanceBuffer);

  gl.enableVertexAttribArray(shader.locPos);
  gl.vertexAttribPointer(shader.locPos, 3, gl.FLOAT, false, INSTANCE_STRIDE, 0);
  gl.vertexAttribDivisor(shader.locPos, 1);

  gl.enableVertexAttribArray(shader.locCosScale);
  gl.vertexAttribPointer(shader.locCosScale, 1, gl.FLOAT, false, INSTANCE_STRIDE, 12);
  gl.vertexAttribDivisor(shader.locCosScale, 1);

  gl.enableVertexAttribArray(shader.locSinScale);
  gl.vertexAttribPointer(shader.locSinScale, 1, gl.FLOAT, false, INSTANCE_STRIDE, 16);
  gl.vertexAttribDivisor(shader.locSinScale, 1);

  gl.enableVertexAttribArray(shader.locColor);
  gl.vertexAttribPointer(shader.locColor, 4, gl.FLOAT, false, INSTANCE_STRIDE, 20);
  gl.vertexAttribDivisor(shader.locColor, 1);

  gl.enableVertexAttribArray(shader.locUvRect);
  gl.vertexAttribPointer(shader.locUvRect, 4, gl.FLOAT, false, INSTANCE_STRIDE, 36);
  gl.vertexAttribDivisor(shader.locUvRect, 1);

  gl.enableVertexAttribArray(shader.locSize);
  gl.vertexAttribPointer(shader.locSize, 2, gl.FLOAT, false, INSTANCE_STRIDE, 52);
  gl.vertexAttribDivisor(shader.locSize, 1);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shader.indexBuffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, drawCount);

  gl.vertexAttribDivisor(shader.locPos, 0);
  gl.vertexAttribDivisor(shader.locCosScale, 0);
  gl.vertexAttribDivisor(shader.locSinScale, 0);
  gl.vertexAttribDivisor(shader.locColor, 0);
  gl.vertexAttribDivisor(shader.locUvRect, 0);
  gl.vertexAttribDivisor(shader.locSize, 0);
}

export function destroyGlParticleEmitter3DShader(state: GlRenderState): void {
  const shader = shaderCache.get(state);
  if (shader === undefined) return;
  const gl = state.gl;
  gl.deleteProgram(shader.program);
  gl.deleteBuffer(shader.cornerBuffer);
  gl.deleteBuffer(shader.indexBuffer);
  gl.deleteBuffer(shader.instanceBuffer);
  shaderCache.delete(state);
}

export function drawGlSceneParticleEmitters(
  state: GlRenderState,
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
): void {
  emitterScratch.length = 0;
  collectParticleEmitter3DNodes(scene, emitterScratch);
  if (emitterScratch.length === 0) return;

  const list = prepareSceneRender(state, scene, camera, lights);

  const shader = ensureParticle3DShader(state);
  const gl = state.gl;

  gl.useProgram(shader.program);
  gl.uniformMatrix4fv(shader.locViewProjection, false, list.viewProjection.m);

  // Camera right and up from the view matrix rows (column-major storage).
  const vm = camera.view.m;
  gl.uniform3f(shader.locCameraRight, vm[0], vm[4], vm[8]);
  gl.uniform3f(shader.locCameraUp, vm[1], vm[5], vm[9]);

  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  for (let i = 0; i < emitterScratch.length; i++) {
    drawParticleEmitter3DNode(gl, shader, emitterScratch[i]);
  }

  gl.depthMask(true);
  gl.disable(gl.BLEND);

  invalidateGlRenderStateCache(state);
}

const emitterScratch: ParticleEmitter3D[] = [];
const shaderCache = new WeakMap<GlRenderState, GlParticle3DShader>();
