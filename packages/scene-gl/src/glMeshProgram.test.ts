import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { createTexture, setTextureUvOffset, setTextureUvScale } from '@flighthq/texture';
import type { Camera, ImageResource } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';
import {
  GL_MAX_SKIN_JOINTS,
  GL_SKIN_JOINT_HARD_CAP,
  beginGlMeshDraw,
  bindGlUvTransform,
  compileGlProgram,
  destroyGlMeshProgram,
  drawGlMeshSubset,
  ensureGlSceneProgram,
  getGlSkinJointCapacity,
  hasGlUvTransform,
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

describe('bindGlUvTransform', () => {
  it('uploads the KHR transform as a column-major mat3 with transpose=false', () => {
    const gl = makeFakeGl2();
    const program = makeProgram();
    const texture = createTexture();
    setTextureUvScale(texture, 2, 3);
    // Exactly-representable float32 offsets so the upload buffer compares without rounding slop.
    setTextureUvOffset(texture, 0.5, 0.25);

    bindGlUvTransform(gl, program, texture);

    const call = gl.calls.find((c) => c.name === 'uniformMatrix3fv');
    expect(call).toBeDefined();
    // transpose=false: the buffer is already column-major (col0 = U axis, col1 = V axis, col2 = xlate).
    expect(call?.args[1]).toBe(false);
    // `+ 0` normalizes the -0 from -sy*sin(0) to +0 so the column-major buffer compares cleanly.
    const uploaded = Array.from(call?.args[2] as Float32Array).map((n) => n + 0);
    expect(uploaded).toEqual([2, 0, 0, 0, 3, 0, 0.5, 0.25, 1]);
  });

  it('resolves the location once and skips the upload for a null texture', () => {
    const gl = makeFakeGl2();
    const program = makeProgram();

    bindGlUvTransform(gl, program, null);

    expect(gl.calls.filter((c) => c.name === 'getUniformLocation' && c.args[0] === 'u_uvTransform').length).toBe(1);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix3fv')).toBe(false);
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

describe('getGlSkinJointCapacity', () => {
  it('derives the palette size from MAX_VERTEX_UNIFORM_VECTORS above the guaranteed floor', () => {
    // The default fake context reports 1024 vectors → (1024 − 24) / 4 = 250 palette slots.
    const { state } = makeGlSceneState();
    expect(getGlSkinJointCapacity(state)).toBe(250);
  });

  it('clamps to the guaranteed 64 floor on a minimum-spec budget', () => {
    const gl = makeFakeGl2();
    gl.getParameter = (pname: number) => (pname === gl.MAX_VERTEX_UNIFORM_VECTORS ? 256 : 0);
    const { state } = makeGlSceneState(gl);
    expect(getGlSkinJointCapacity(state)).toBe(GL_MAX_SKIN_JOINTS);
  });

  it('clamps to the hard cap on a very large budget', () => {
    const gl = makeFakeGl2();
    gl.getParameter = (pname: number) => (pname === gl.MAX_VERTEX_UNIFORM_VECTORS ? 100_000 : 0);
    const { state } = makeGlSceneState(gl);
    expect(getGlSkinJointCapacity(state)).toBe(GL_SKIN_JOINT_HARD_CAP);
  });

  it('falls back to the floor when the context cannot report a budget', () => {
    const gl = makeFakeGl2();
    (gl as { getParameter?: unknown }).getParameter = undefined;
    const { state } = makeGlSceneState(gl);
    expect(getGlSkinJointCapacity(state)).toBe(GL_MAX_SKIN_JOINTS);
  });

  it('queries the GL budget once and caches it per state', () => {
    const gl = makeFakeGl2();
    let queries = 0;
    gl.getParameter = (pname: number) => {
      queries++;
      return pname === gl.MAX_VERTEX_UNIFORM_VECTORS ? 1024 : 0;
    };
    const { state } = makeGlSceneState(gl);
    getGlSkinJointCapacity(state);
    getGlSkinJointCapacity(state);
    expect(queries).toBe(1);
  });
});

describe('hasGlUvTransform', () => {
  it('is false for a null texture', () => {
    expect(hasGlUvTransform(null)).toBe(false);
  });

  it('is false for an identity transform even with a bound image', () => {
    expect(hasGlUvTransform(createTexture({ image: {} as ImageResource }))).toBe(false);
  });

  it('is false for a non-identity transform whose image is unbound', () => {
    const texture = createTexture();
    setTextureUvScale(texture, 2, 2);

    expect(hasGlUvTransform(texture)).toBe(false);
  });

  it('is true only when a bound image carries a non-identity transform', () => {
    const texture = createTexture({ image: {} as ImageResource });
    setTextureUvScale(texture, 2, 2);

    expect(hasGlUvTransform(texture)).toBe(true);
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
