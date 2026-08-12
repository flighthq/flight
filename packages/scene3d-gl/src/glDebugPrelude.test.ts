import type { GlDebugDefineKey } from '@flighthq/types/contract';

import {
  bindGlDebugNormalMap,
  bindGlDebugRange,
  buildGlDebugDefineKey,
  compileGlDebugProgram,
  ensureGlDebugProgram,
  getGlDebugFragmentSourceForKey,
  getGlDebugVertexSourceForKey,
} from './glDebugPrelude';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';

const DEPTH: GlDebugDefineKey = { hasNormalMap: false, mode: 'depth' };
const NORMAL: GlDebugDefineKey = { hasNormalMap: false, mode: 'normal' };
const NORMAL_MAP: GlDebugDefineKey = { hasNormalMap: true, mode: 'normal' };

describe('bindGlDebugNormalMap', () => {
  it('uploads the normal scale and binds no texture when no map is present', () => {
    const { state, gl } = makeGlScene3DState();
    const program = compileGlDebugProgram(gl, NORMAL);
    bindGlDebugNormalMap(state, program, null, 2);
    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'bindTexture')).toBe(false);
  });
});

describe('bindGlDebugRange', () => {
  it('uploads the near and far linearization range', () => {
    const { state, gl } = makeGlScene3DState();
    const program = compileGlDebugProgram(gl, DEPTH);
    bindGlDebugRange(state, program, 0.1, 100);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildGlDebugDefineKey', () => {
  it('produces distinct stable strings per mode and normal-map flag', () => {
    expect(buildGlDebugDefineKey(DEPTH)).toBe('d--');
    expect(buildGlDebugDefineKey(NORMAL)).toBe('n--');
    expect(buildGlDebugDefineKey(NORMAL_MAP)).toBe('nm-');
    expect(buildGlDebugDefineKey({ ...DEPTH, hasSkin: true })).toBe('d-k');
  });
});

describe('compileGlDebugProgram', () => {
  it('compiles, links, and resolves the debug uniforms including the normal matrix', () => {
    const gl = makeFakeGl2();
    const program = compileGlDebugProgram(gl, NORMAL);
    expect(program.locNormalMatrix).not.toBeNull();
    expect(program.locNormalScale).not.toBeNull();
    expect(program.locViewProjection).not.toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });

  it('resolves the view matrix used by the depth variant', () => {
    const gl = makeFakeGl2();
    const program = compileGlDebugProgram(gl, DEPTH);
    expect(program.locView).not.toBeNull();
  });
});

describe('ensureGlDebugProgram', () => {
  it('caches variants under the debug namespace with distinct depth and normal entries', () => {
    const { state, gl } = makeGlScene3DState();
    const depthFirst = ensureGlDebugProgram(state, DEPTH);
    const depthSecond = ensureGlDebugProgram(state, DEPTH);
    expect(depthSecond).toBe(depthFirst);

    const normalProgram = ensureGlDebugProgram(state, NORMAL);
    expect(normalProgram).not.toBe(depthFirst);

    const keys = [...getGlScene3DRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('debug:'))).toBe(true);
    expect(keys).toContain('debug:d--');
    expect(keys).toContain('debug:n--');
    // The two distinct variants compiled exactly once each.
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(2);
  });

  it('caches rigid and skinned variants independently from the active draw run', () => {
    const { state } = makeGlScene3DState();
    const rigid = ensureGlDebugProgram(state, DEPTH);
    getGlScene3DRuntime(state).activeSkinnedRun = true;
    const skinned = ensureGlDebugProgram(state, DEPTH);

    expect(skinned).not.toBe(rigid);
    expect([...getGlScene3DRuntime(state).programCache.keys()]).toEqual(['debug:d--', 'debug:d-k']);
  });
});

describe('getGlDebugFragmentSourceForKey', () => {
  it('gates the mode and normal-map branches by define', () => {
    expect(getGlDebugFragmentSourceForKey(DEPTH)).toContain('#define DEPTH_MODE');
    expect(getGlDebugFragmentSourceForKey(DEPTH)).not.toContain('#define NORMAL_MODE');
    expect(getGlDebugFragmentSourceForKey(NORMAL)).toContain('#define NORMAL_MODE');
    expect(getGlDebugFragmentSourceForKey(NORMAL)).not.toContain('#define HAS_NORMAL_MAP');
    expect(getGlDebugFragmentSourceForKey(NORMAL_MAP)).toContain('#define HAS_NORMAL_MAP');
  });

  it('reads projection-independent view depth instead of reciprocal clip w', () => {
    const source = getGlDebugFragmentSourceForKey(DEPTH);
    expect(source).toContain('v_viewDepth - u_near');
    expect(source).not.toContain('gl_FragCoord.w');
  });
});

describe('getGlDebugVertexSourceForKey', () => {
  it('carries the model, normal, and view-projection uniforms for both modes', () => {
    const source = getGlDebugVertexSourceForKey(NORMAL);
    expect(source).toContain('u_model');
    expect(source).toContain('u_normalMatrix');
    expect(source).toContain('u_viewProjection');
    expect(getGlDebugVertexSourceForKey(DEPTH)).toContain('a_position');
  });

  it('computes positive view-axis depth before projection', () => {
    const source = getGlDebugVertexSourceForKey(DEPTH);
    expect(source).toContain('uniform mat4 u_view');
    expect(source).toContain('v_viewDepth = -(u_view * worldPosition).z');
  });

  it('deforms position, normal, and tangent only in the skinned variant', () => {
    const rigid = getGlDebugVertexSourceForKey(NORMAL);
    const skinned = getGlDebugVertexSourceForKey({ ...NORMAL, hasSkin: true });

    expect(rigid).not.toContain('#define HAS_SKIN');
    expect(rigid).not.toContain('skinMatrix() *');
    expect(skinned).toContain('#define HAS_SKIN');
    expect(skinned).toContain('uniform highp sampler2D u_jointTexture');
    expect(skinned).toContain('mat4 skin = skinMatrix()');
    expect(skinned).toContain('skinNormalMatrix() * a_normal');
    expect(skinned).toContain('mat3(skin) * a_tangent.xyz');
  });
});

describe('tangent frame under a model transform', () => {
  it('carries the tangent through the model matrix and the mirror through its handedness', () => {
    const vertex = getGlDebugVertexSourceForKey(NORMAL);
    expect(vertex).toContain('mat3 modelRotation = mat3(u_model);');
    expect(vertex).toContain('determinant(modelRotation) < 0.0 ? -1.0 : 1.0');
    expect(vertex).toContain('v_tangent = vec4(modelRotation * localTangent, tangentHandedness);');
    expect(vertex).not.toContain('u_normalMatrix * a_tangent');
    expect(vertex).not.toContain('u_normalMatrix * localTangent');
  });
});
