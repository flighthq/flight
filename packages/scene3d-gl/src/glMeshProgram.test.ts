import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry, createMeshGeometry } from '@flighthq/mesh/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createTexture, setTextureUvOffset, setTextureUvScale } from '@flighthq/texture/contract';
import type {
  Camera3D,
  Image,
  PrimitiveTopology,
  VertexAttributeLayout,
  GlMeshProgram,
} from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import {
  SKIN_PALETTE_TEXTURE_UNIT,
  beginGlMeshDraw,
  bindGlMeshSkinPalette,
  bindGlUvTransform,
  compileGlProgram,
  uploadGlMeshDrawAlpha,
  destroyGlMeshProgram,
  drawGlMeshSubset,
  ensureGlScene3DProgram,
  hasGlUvTransform,
  setGlMeshCameraPosition,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
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
  it('disables depth writes for every bind in a blended run', () => {
    const { state, gl } = makeGlScene3DState();
    getGlScene3DRuntime(state).activeBlendedRun = true;

    beginGlMeshDraw(state, makeProgram(), false);
    beginGlMeshDraw(state, makeProgram(), false);

    expect(gl.calls.filter((c) => c.name === 'depthMask').map((c) => c.args[0])).toEqual([false, false]);
  });

  it('stores the active program, selects it, and sets depth + back-face cull', () => {
    const { state, gl } = makeGlScene3DState();
    beginGlMeshDraw(state, makeProgram(), false);
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.CULL_FACE)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'depthMask' && c.args[0] === true)).toBe(true);
  });

  it('disables culling for a double-sided material', () => {
    const { state, gl } = makeGlScene3DState();
    beginGlMeshDraw(state, makeProgram(), true);
    expect(gl.calls.some((c) => c.name === 'disable' && c.args[0] === gl.CULL_FACE)).toBe(true);
  });
});

describe('bindGlMeshSkinPalette', () => {
  it('reports a GPU-skinned draw after binding its pose palette', () => {
    const { state, gl } = makeGlScene3DState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram();
    program.locJointTexture = { name: 'u_jointTexture' } as WebGLUniformLocation;

    const gpuSkinned = bindGlMeshSkinPalette(state, program, {
      jointMatrices: new Float32Array(16),
      material: createStandardPbrMaterial(),
      normalMatrix: createMatrix3(),
      subset: geometry.subsets[0],
      worldMatrix: createMatrix4(),
    });

    expect(gpuSkinned).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform1i' && c.args[1] === SKIN_PALETTE_TEXTURE_UNIT)).toBe(true);
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
    const { state, gl } = makeGlScene3DState();
    const program = makeProgram();
    destroyGlMeshProgram(state, program);
    const deletes = gl.calls.filter((c) => c.name === 'deleteProgram');
    expect(deletes.length).toBe(1);
    expect(deletes[0].args[0]).toBe(program.program);
  });
});

describe('drawGlMeshSubset', () => {
  it('uploads the model + normal matrices and issues an indexed draw over the subset', () => {
    const { state, gl } = makeGlScene3DState();
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

  it.each([
    ['line-list', 'LINES'],
    ['line-strip', 'LINE_STRIP'],
    ['point-list', 'POINTS'],
    ['triangle-list', 'TRIANGLES'],
    ['triangle-strip', 'TRIANGLE_STRIP'],
  ] as const)('draws %s geometry with the matching GL primitive mode', (topology, constant) => {
    const { state, gl } = makeGlScene3DState();
    const geometry = createBoxMeshGeometry();
    geometry.topology = topology as PrimitiveTopology;
    drawGlMeshSubset(
      state,
      makeProgram(),
      {
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );
    const draw = gl.calls.find((call) => call.name === 'drawElements');
    expect(draw?.args[0]).toBe(gl[constant]);
  });

  it('draws a non-indexed geometry with its vertex count', () => {
    const { state, gl } = makeGlScene3DState();
    const layout: VertexAttributeLayout = {
      attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
      stride: 12,
    };
    const geometry = createMeshGeometry({ layout, vertices: new Float32Array(9) });
    drawGlMeshSubset(
      state,
      makeProgram(),
      {
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );
    const draw = gl.calls.find((call) => call.name === 'drawArrays');
    expect(draw?.args).toEqual([gl.TRIANGLES, 0, 3]);
  });

  it('uploads u_objectAlpha with the proxy alpha when the program has an object-alpha location', () => {
    const { state, gl } = makeGlScene3DState();
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
    const { state, gl } = makeGlScene3DState();
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
    const { state, gl } = makeGlScene3DState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram();
    program.locObjectAlpha = null; // resolved: this shader has no u_objectAlpha
    program.locAlphaIsCoverage = null; // and no u_alphaIsCoverage either
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
    const { state, gl } = makeGlScene3DState();
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
    const { state, gl } = makeGlScene3DState();
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

  it('uploads the bone palette into the data texture and binds the skin unit for a skinned draw', () => {
    const { state, gl } = makeGlScene3DState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram();
    program.locJointTexture = { name: 'u_jointTexture' } as WebGLUniformLocation;
    // Two joints' palette (32 floats) → texture width = 2 joints * 4 = 8 texels.
    const jointMatrices = new Float32Array(2 * 16);
    drawGlMeshSubset(
      state,
      program,
      {
        jointMatrices,
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );

    // The palette allocates RGBA32F storage on the skin-palette unit and the sampler is set to it.
    expect(
      gl.calls.some((c) => c.name === 'activeTexture' && c.args[0] === gl.TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT),
    ).toBe(true);
    const alloc = gl.calls.find((c) => c.name === 'texImage2D');
    expect(alloc?.args[3]).toBe(8); // width = 2 joints * 4 texels
    expect(gl.calls.some((c) => c.name === 'uniform1i' && c.args[1] === SKIN_PALETTE_TEXTURE_UNIT)).toBe(true);
  });

  it('skips the skin upload when the program has no joint-texture location', () => {
    const { state, gl } = makeGlScene3DState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram(); // locJointTexture undefined → not a skinned program
    drawGlMeshSubset(
      state,
      program,
      {
        jointMatrices: new Float32Array(16),
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix: createMatrix4(),
      },
      geometry,
    );
    expect(gl.calls.some((c) => c.name === 'texImage2D')).toBe(false);
  });

  it('skips the skin upload for a skinned program drawing a rigid (paletteless) mesh', () => {
    const { state, gl } = makeGlScene3DState();
    const geometry = createBoxMeshGeometry();
    const program = makeProgram();
    program.locJointTexture = { name: 'u_jointTexture' } as WebGLUniformLocation;
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
    expect(gl.calls.some((c) => c.name === 'texImage2D')).toBe(false);
  });
});

describe('ensureGlScene3DProgram', () => {
  it('compiles a key once and returns the cached program on repeat', () => {
    const { state } = makeGlScene3DState();
    let compiles = 0;
    const compile = (): GlMeshProgram => {
      compiles++;
      return makeProgram();
    };
    const first = ensureGlScene3DProgram(state, 'fam:a', compile);
    const second = ensureGlScene3DProgram(state, 'fam:a', compile);
    expect(second).toBe(first);
    expect(compiles).toBe(1);
  });

  it('compiles distinct programs for distinct keys', () => {
    const { state } = makeGlScene3DState();
    ensureGlScene3DProgram(state, 'fam:a', makeProgram);
    ensureGlScene3DProgram(state, 'fam:b', makeProgram);
    // Two distinct keys → two cached entries (the shared programCache spans every family).
    ensureGlScene3DProgram(state, 'fam:a', makeProgram);
  });
});

describe('front-face selection under a mirroring world matrix', () => {
  // A world matrix with a negative determinant turns every triangle inside out on the way to clip
  // space, so the exterior a mesh authored counter-clockwise arrives clockwise. With back-face
  // culling on that culls the very surface the viewer should see, and the interior shows instead.
  // The winding is correct and must not be rewritten — what changes is which orientation counts as
  // front, so this is a per-draw front-face decision.
  function frontFaceArgsForScaleX(scaleX: number): unknown[] {
    const { state, gl } = makeGlScene3DState();
    const geometry = createBoxMeshGeometry();
    const worldMatrix = createMatrix4();
    worldMatrix.m[0] = scaleX;
    drawGlMeshSubset(
      state,
      makeProgram(),
      {
        material: createStandardPbrMaterial(),
        normalMatrix: createMatrix3(),
        subset: geometry.subsets[0],
        worldMatrix,
      },
      geometry,
    );
    return gl.calls.filter((c) => c.name === 'frontFace').map((c) => c.args[0]);
  }

  it('keeps counter-clockwise front for an ordinary transform', () => {
    // Set before the draw and restored after it, so an ordinary mesh sets CCW twice.
    expect(frontFaceArgsForScaleX(1)).toEqual([0x0901, 0x0901]); // GL_CCW
  });

  it('switches to clockwise front for a mirrored transform', () => {
    // CW for the mirrored draw, then restored to CCW so it cannot leak into the present pass.
    expect(frontFaceArgsForScaleX(-1)).toEqual([0x0900, 0x0901]); // GL_CW then GL_CCW
  });
});

describe('hasGlUvTransform', () => {
  it('is false for a null texture', () => {
    expect(hasGlUvTransform(null)).toBe(false);
  });

  it('is false for an identity transform even with a bound image', () => {
    expect(
      hasGlUvTransform(
        createTexture({
          dimension: '2d',
          source: { kind: ImageTextureSourceKind } as Image,
        }),
      ),
    ).toBe(false);
  });

  it('is false for a non-identity transform whose image is unbound', () => {
    const texture = createTexture();
    setTextureUvScale(texture, 2, 2);

    expect(hasGlUvTransform(texture)).toBe(false);
  });

  it('is true only when a bound image carries a non-identity transform', () => {
    const texture = createTexture({
      dimension: '2d',
      source: { kind: ImageTextureSourceKind } as Image,
    });
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
  it('uploads a view-projection using the active viewport aspect', () => {
    const { state, gl } = makeGlScene3DState();
    getGlRenderStateRuntime(state).renderTargetViewport = { height: 100, width: 200, x: 10, y: 20 };

    setGlMeshViewProjection(state, { name: 'u_viewProjection' } as WebGLUniformLocation, makeCamera());

    const upload = gl.calls.find((c) => c.name === 'uniformMatrix4fv');
    expect(upload).toBeDefined();
    expect((upload!.args[2] as Float32Array)[0]).toBeCloseTo(Math.sqrt(3) / 2);
  });
});

describe('uploadGlMeshDrawAlpha', () => {
  // Regression guard for the wireframe blank-frame defect: this upload used to live inside
  // drawGlMeshSubset, so the one family that bypasses that function shipped u_objectAlpha = 0 —
  // invisible until the fragment tail began premultiplying rgb by alpha, then a black frame.
  it('uploads node alpha and resolves each location once across draws', () => {
    const { state, gl } = makeGlScene3DState();
    const program = makeProgram();
    program.locObjectAlpha = { name: 'u_objectAlpha' } as WebGLUniformLocation;
    program.locAlphaIsCoverage = { name: 'u_alphaIsCoverage' } as WebGLUniformLocation;

    uploadGlMeshDrawAlpha(state.gl, program, 0.25, null);
    uploadGlMeshDrawAlpha(state.gl, program, 1, null);

    const alphas = gl.calls.filter((c) => c.name === 'uniform1f' && c.args[0] === program.locObjectAlpha);
    expect(alphas.map((c) => c.args[1])).toEqual([0.25, 1]);
    expect(gl.calls.some((c) => c.name === 'getUniformLocation')).toBe(false);
  });

  // The premultiplying tail must not scale rgb on a draw nothing is compositing. Only glTF's 'blend'
  // declares its alpha to be coverage; 'opaque' and 'mask' resolve to fully opaque.
  it('flags alpha as coverage only for a blended material', () => {
    const { state, gl } = makeGlScene3DState();
    const program = makeProgram();
    program.locObjectAlpha = { name: 'u_objectAlpha' } as WebGLUniformLocation;
    program.locAlphaIsCoverage = { name: 'u_alphaIsCoverage' } as WebGLUniformLocation;

    const coverageOf = (material: Parameters<typeof uploadGlMeshDrawAlpha>[3]): unknown => {
      gl.calls.length = 0;
      uploadGlMeshDrawAlpha(state.gl, program, 1, material);
      return gl.calls.find((c) => c.name === 'uniform1f' && c.args[0] === program.locAlphaIsCoverage)?.args[1];
    };

    expect(coverageOf(createStandardPbrMaterial({ alphaMode: 'blend' }))).toBe(1);
    expect(coverageOf(createStandardPbrMaterial({ alphaMode: 'mask' }))).toBe(0);
    expect(coverageOf(createStandardPbrMaterial({ alphaMode: 'opaque' }))).toBe(0);
    expect(coverageOf(null)).toBe(0);
  });

  it('skips silently for a program whose shader declares neither uniform', () => {
    const { state, gl } = makeGlScene3DState();
    const program = makeProgram();
    program.locObjectAlpha = null;
    program.locAlphaIsCoverage = null;

    uploadGlMeshDrawAlpha(state.gl, program, 0.25, null);

    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(false);
  });
});
