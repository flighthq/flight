import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createCustomShaderMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createGlPipeline, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { CustomShaderMaterialKind } from '@flighthq/types/contract';

import {
  customShaderGlMeshMaterialRenderer,
  getGlCustomMaterialShaderSource,
  registerGlCustomShaderMaterial,
  registerGlCustomMaterialShader,
} from './customShaderGlMeshMaterialRenderer';
import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: Scene3DLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

const VERTEX_SRC = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
uniform vec3 u_cameraPosition;
void main() {
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform float u_time;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0, 0.0, u_time, 1.0);
}`;

function makeProxy(): Scene3DRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createCustomShaderMaterial({ shaderKey: 'test' }),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('customShaderGlMeshMaterialRenderer', () => {
  it('bind selects a program and uploads view-projection and camera position when shader is registered', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlCustomMaterialShader(state, 'test', { fragment: FRAGMENT_SRC, vertex: VERTEX_SRC });
    customShaderGlMeshMaterialRenderer.bind(
      state,
      createCustomShaderMaterial({ shaderKey: 'test' }),
      NO_LIGHTS,
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform3f')).toBe(true);
  });

  it('bind uploads custom uniforms from the material', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlCustomMaterialShader(state, 'test', { fragment: FRAGMENT_SRC, vertex: VERTEX_SRC });
    customShaderGlMeshMaterialRenderer.bind(
      state,
      createCustomShaderMaterial({ shaderKey: 'test', uniforms: { u_time: 0.5, u_scale: [2, 3] } }),
      NO_LIGHTS,
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'uniform1f' && c.args[1] === 0.5)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform2fv')).toBe(true);
  });

  it('bind is a no-op (sets active program null) when shaderKey is not registered', () => {
    const { state, gl } = makeGlScene3DState();
    customShaderGlMeshMaterialRenderer.bind(
      state,
      createCustomShaderMaterial({ shaderKey: 'missing' }),
      NO_LIGHTS,
      makeCamera(),
    );
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(false);
  });

  it('bind is a no-op when shaderKey is empty', () => {
    const { state, gl } = makeGlScene3DState();
    customShaderGlMeshMaterialRenderer.bind(state, createCustomShaderMaterial(), NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(false);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlCustomMaterialShader(state, 'test', { fragment: FRAGMENT_SRC, vertex: VERTEX_SRC });
    const proxy = makeProxy();
    customShaderGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    customShaderGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    expect(draw!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind skipped due to missing shader key', () => {
    const { state, gl } = makeGlScene3DState();
    customShaderGlMeshMaterialRenderer.bind(
      state,
      createCustomShaderMaterial({ shaderKey: 'missing' }),
      NO_LIGHTS,
      makeCamera(),
    );
    customShaderGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});

describe('getGlCustomMaterialShaderSource', () => {
  it('returns the source registered under the given key', () => {
    const { state } = makeGlScene3DState();
    const source = { fragment: FRAGMENT_SRC, vertex: VERTEX_SRC };
    registerGlCustomMaterialShader(state, 'ripple', source);
    expect(getGlCustomMaterialShaderSource(state, 'ripple')).toBe(source);
  });

  it('returns null for an unregistered key', () => {
    const { state } = makeGlScene3DState();
    expect(getGlCustomMaterialShaderSource(state, 'nope')).toBeNull();
  });
});

describe('registerGlCustomMaterialShader', () => {
  it('replaces the persistent table while an explicitly copied state retains its snapshot', () => {
    const { state: screen } = makeGlScene3DState();
    const source = { fragment: 'first', vertex: 'first' };
    const replacement = { fragment: 'replacement', vertex: 'replacement' };
    registerGlCustomMaterialShader(screen, 'ripple', source);
    const snapshot = getGlRenderStateRuntime(screen).registries.customMaterialShaders;
    const { state: derived } = makeGlScene3DState(
      undefined,
      createGlPipeline(getGlRenderStateRuntime(screen).registries),
    );

    getGlScene3DRuntime(derived);
    registerGlCustomMaterialShader(screen, 'ripple', replacement);

    expect(getGlRenderStateRuntime(derived).registries.customMaterialShaders).toBe(snapshot);
    expect(getGlRenderStateRuntime(screen).registries.customMaterialShaders).not.toBe(snapshot);
    expect(getRegistryTableEntry(snapshot, 'ripple')).toBe(source);
    expect(getGlCustomMaterialShaderSource(derived, 'ripple')).toBe(source);
    expect(getGlCustomMaterialShaderSource(screen, 'ripple')).toBe(replacement);
  });

  it('stores shader source retrievable by key', () => {
    const { state } = makeGlScene3DState();
    const source = { fragment: FRAGMENT_SRC, vertex: VERTEX_SRC };
    registerGlCustomMaterialShader(state, 'ripple', source);
    expect(getGlCustomMaterialShaderSource(state, 'ripple')).toBe(source);
  });

  it('last write wins per key', () => {
    const { state } = makeGlScene3DState();
    const a = { fragment: 'a', vertex: 'a' };
    const b = { fragment: 'b', vertex: 'b' };
    registerGlCustomMaterialShader(state, 'key', a);
    registerGlCustomMaterialShader(state, 'key', b);
    expect(getGlCustomMaterialShaderSource(state, 'key')).toBe(b);
  });
});

describe('registerGlCustomShaderMaterial', () => {
  it('installs the renderer for CustomShaderMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlCustomShaderMaterial(state);
    expect(getGlMeshMaterialRenderer(state, CustomShaderMaterialKind)).toBe(customShaderGlMeshMaterialRenderer);
  });
});
