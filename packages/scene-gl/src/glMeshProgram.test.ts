import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';
import {
  beginGlMeshDraw,
  compileGlProgram,
  destroyGlMeshProgram,
  drawGlMeshSubset,
  ensureGlSceneProgram,
  setGlMeshCameraPosition,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeProgram(): GlMeshProgram {
  return {
    locModel: { name: 'u_model' } as WebGLUniformLocation,
    locNormalMatrix: { name: 'u_normalMatrix' } as WebGLUniformLocation,
    locViewProjection: { name: 'u_viewProjection' } as WebGLUniformLocation,
    program: {} as WebGLProgram,
  };
}

describe('beginGlMeshDraw', () => {
  it('stores the active program, selects it, and sets depth + back-face cull', () => {
    const { state, gl } = makeGlSceneState();
    beginGlMeshDraw(state, makeProgram(), false);
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.CULL_FACE)).toBe(true);
  });

  it('disables culling for a double-sided material', () => {
    const { state, gl } = makeGlSceneState();
    beginGlMeshDraw(state, makeProgram(), true);
    expect(gl.calls.some((c) => c.name === 'disable' && c.args[0] === gl.CULL_FACE)).toBe(true);
  });
});

describe('compileGlProgram', () => {
  it('compiles, attaches, and links a vertex + fragment pair', () => {
    const gl = makeFakeGl2();
    const program = compileGlProgram(gl, '#version 300 es\nvoid main(){}', '#version 300 es\nvoid main(){}');
    expect(program).not.toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });

  it('throws on a shader compile failure', () => {
    const gl = makeFakeGl2({ compileOk: false });
    expect(() => compileGlProgram(gl, 'v', 'f')).toThrow(/compile error/);
  });

  it('throws on a program link failure', () => {
    const gl = makeFakeGl2({ linkOk: false });
    expect(() => compileGlProgram(gl, 'v', 'f')).toThrow(/link error/);
  });
});

describe('destroyGlMeshProgram', () => {
  it('deletes the linked GL program', () => {
    const { state, gl } = makeGlSceneState();
    const program = makeProgram();
    destroyGlMeshProgram(state, program);
    const deletes = gl.calls.filter((c) => c.name === 'deleteProgram');
    expect(deletes.length).toBe(1);
    expect(deletes[0].args[0]).toBe(program.program);
  });
});

describe('drawGlMeshSubset', () => {
  it('uploads the model + normal matrices and issues an indexed draw over the subset', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const proxy = {
      material: createStandardPbrMaterial(),
      normalMatrix: createMatrix3(),
      subset: geometry.subsets[0],
      worldMatrix: createMatrix4(),
    };
    drawGlMeshSubset(state, makeProgram(), proxy, geometry);

    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix3fv')).toBe(true);
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    expect(draw!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('uploads u_objectAlpha with the proxy alpha when the program has an object-alpha location', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram();
    program.locObjectAlpha = { name: 'u_objectAlpha' } as WebGLUniformLocation;
    drawGlMeshSubset(
      state,
      program,
      {
        alpha: 0.25,
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );
    expect(gl.calls.some((c) => c.name === 'uniform1f' && c.args[1] === 0.25)).toBe(true);
  });

  it('defaults u_objectAlpha to 1 when the proxy carries no alpha', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram();
    program.locObjectAlpha = { name: 'u_objectAlpha' } as WebGLUniformLocation;
    drawGlMeshSubset(
      state,
      program,
      {
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );
    expect(gl.calls.some((c) => c.name === 'uniform1f' && c.args[1] === 1)).toBe(true);
  });

  it('is a no-op for object alpha when the program has no object-alpha location', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram();
    program.locObjectAlpha = null; // resolved: this shader has no u_objectAlpha
    drawGlMeshSubset(
      state,
      program,
      {
        alpha: 0.5,
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );
    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(false);
    // A null location is not re-resolved (no getUniformLocation for u_objectAlpha).
    expect(gl.calls.some((c) => c.name === 'getUniformLocation' && c.args[0] === 'u_objectAlpha')).toBe(false);
  });

  it('resolves u_objectAlpha lazily on first draw when unresolved (undefined)', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram(); // locObjectAlpha undefined
    drawGlMeshSubset(
      state,
      program,
      {
        alpha: 0.5,
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );
    expect(gl.calls.some((c) => c.name === 'getUniformLocation' && c.args[0] === 'u_objectAlpha')).toBe(true);
  });

  it('skips the normal matrix when the program has no normal-matrix location', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram();
    program.locNormalMatrix = null;
    drawGlMeshSubset(
      state,
      program,
      {
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );
    expect(gl.calls.some((c) => c.name === 'uniformMatrix3fv')).toBe(false);
  });
});

describe('ensureGlSceneProgram', () => {
  it('compiles a key once and returns the cached program on repeat', () => {
    const { state } = makeGlSceneState();
    let compiles = 0;
    const compile = (): GlMeshProgram => {
      compiles++;
      return makeProgram();
    };
    const first = ensureGlSceneProgram(state, 'fam:a', compile);
    const second = ensureGlSceneProgram(state, 'fam:a', compile);
    expect(second).toBe(first);
    expect(compiles).toBe(1);
  });

  it('compiles distinct programs for distinct keys', () => {
    const { state } = makeGlSceneState();
    ensureGlSceneProgram(state, 'fam:a', makeProgram);
    ensureGlSceneProgram(state, 'fam:b', makeProgram);
    // Two distinct keys → two cached entries (the shared programCache spans every family).
    ensureGlSceneProgram(state, 'fam:a', makeProgram);
  });
});

describe('setGlMeshCameraPosition', () => {
  it('uploads a vec3 camera world position', () => {
    const gl = makeFakeGl2();
    setGlMeshCameraPosition(gl, { name: 'u_cameraPosition' } as WebGLUniformLocation, makeCamera());
    expect(gl.calls.some((c) => c.name === 'uniform3f')).toBe(true);
  });
});

describe('setGlMeshViewProjection', () => {
  it('uploads the camera view-projection matrix', () => {
    const gl = makeFakeGl2();
    setGlMeshViewProjection(gl, { name: 'u_viewProjection' } as WebGLUniformLocation, makeCamera());
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
  });
});
