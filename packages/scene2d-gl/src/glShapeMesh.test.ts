import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { ColorScaleBias, RenderProxy2D } from '@flighthq/types/contract';

import { registerGlColorAdjustmentMaterialFeature } from './glColorAdjustmentMaterialFeature';
import { drawGlShapeMeshBatch, drawGlShapeMeshes, ensureGlShapeMeshProgram } from './glShapeMesh';
import { createGlState } from './glTestHelper';

function makeProxy(overrides?: Partial<RenderProxy2D>): RenderProxy2D {
  return {
    alpha: 1,
    blendMode: null,
    colorScaleBias: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    ...overrides,
  } as unknown as RenderProxy2D;
}

function ct(
  redScale = 1,
  greenScale = 1,
  blueScale = 1,
  alphaScale = 1,
  redBias = 0,
  greenBias = 0,
  blueBias = 0,
  alphaBias = 0,
): ColorScaleBias {
  return {
    redScale,
    greenScale,
    blueScale,
    alphaScale,
    redBias,
    greenBias,
    blueBias,
    alphaBias,
  } as ColorScaleBias;
}

const TRIANGLE = {
  vertices: new Float32Array([0, 0, 10, 0, 0, 10]),
  indices: new Uint16Array([0, 1, 2]),
  color: 0xff8040ff,
  alpha: 1,
};

describe('drawGlShapeMeshBatch', () => {
  it('runs onProgramBound after the matrix upload and before the draw loop', () => {
    const { state, gl } = createGlState();
    const calls: string[] = [];
    (gl.uniformMatrix3fv as ReturnType<typeof vi.fn>).mockImplementation(() => calls.push('matrix'));
    (gl.drawElements as ReturnType<typeof vi.fn>).mockImplementation(() => calls.push('draw'));

    drawGlShapeMeshBatch(state, makeProxy(), [TRIANGLE], ensureGlShapeMeshProgram(state), () => calls.push('bound'));

    expect(calls).toEqual(['matrix', 'bound', 'draw']);
  });

  it('is a no-op for an empty mesh list', () => {
    const { state, gl } = createGlState();
    drawGlShapeMeshBatch(state, makeProxy(), [], ensureGlShapeMeshProgram(state));
    expect(gl.useProgram).not.toHaveBeenCalled();
  });
});

describe('drawGlShapeMeshes', () => {
  it('binds the mesh program and draws each mesh', () => {
    const { state, gl } = createGlState();

    drawGlShapeMeshes(state, makeProxy(), [TRIANGLE]);

    expect(gl.useProgram).toHaveBeenCalled();
    expect(gl.drawElements).toHaveBeenCalledWith(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0);
  });

  it('records the mesh program as currentProgram so content draws re-bind', () => {
    const { state } = createGlState();
    expect(getGlRenderStateRuntime(state).currentProgram).toBeNull();

    drawGlShapeMeshes(state, makeProxy(), [TRIANGLE]);

    expect(getGlRenderStateRuntime(state).currentProgram).not.toBeNull();
  });

  it('uploads premultiplied color (color * alpha) for the standard blend', () => {
    const { state, gl } = createGlState();

    drawGlShapeMeshes(state, makeProxy(), [{ ...TRIANGLE, color: 0xffffffff, alpha: 0.5 }]);

    expect(gl.uniform4f).toHaveBeenCalledWith(expect.anything(), 0.5, 0.5, 0.5, 0.5);
  });

  it('skips fully transparent meshes', () => {
    const { state, gl } = createGlState();

    drawGlShapeMeshes(state, makeProxy(), [{ ...TRIANGLE, alpha: 0 }]);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty mesh list', () => {
    const { state, gl } = createGlState();

    drawGlShapeMeshes(state, makeProxy(), []);

    expect(gl.useProgram).not.toHaveBeenCalled();
  });

  it('ignores a color adjustment when color adjustment is not enabled (default path pays nothing)', () => {
    const { state } = createGlState();

    drawGlShapeMeshes(state, makeProxy({ colorScaleBias: ct(0.5) }), [TRIANGLE]);

    // The tinted program is compiled only through the opt-in fold; the base path never touches it.
    expect(getGlRenderStateRuntime(state).shapeMeshColorScaleBiasShader).toBeUndefined();
  });

  it('tints solid-fill meshes through the fold with the same uniforms as the quad-batch path', () => {
    const { state, gl } = createGlState();
    registerGlColorAdjustmentMaterialFeature(state);

    // White fill, half-brightness scale, +0.5 normalized-linear red bias.
    drawGlShapeMeshes(state, makeProxy({ colorScaleBias: ct(0.5, 0.5, 0.5, 1, 0.5, 0, 0, 0) }), [
      { ...TRIANGLE, color: 0xffffffff, alpha: 1 },
    ]);

    const shader = getGlRenderStateRuntime(state).shapeMeshColorScaleBiasShader!;
    expect(shader).toBeDefined();
    // Scale and bias are uploaded verbatim — identical to glColorAdjustmentMaterialFeature's
    // bindGlQuadBatchWriterUniformColorScaleBias.
    expect(gl.uniform4f).toHaveBeenCalledWith(shader.colorScaleLocation, 0.5, 0.5, 0.5, 1);
    expect(gl.uniform4f).toHaveBeenCalledWith(shader.colorBiasLocation, 0.5, 0, 0, 0);
    // Flat mesh color still uploaded premultiplied (white, alpha 1); the shader un/re-premultiplies.
    expect(gl.uniform4f).toHaveBeenCalledWith(shader.colorLocation, 1, 1, 1, 1);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('falls back to the lean path through the fold when the node carries no transform', () => {
    const { state } = createGlState();
    registerGlColorAdjustmentMaterialFeature(state);

    drawGlShapeMeshes(state, makeProxy({ colorScaleBias: null }), [TRIANGLE]);

    // No transform → the fold is not consulted (gated on non-null), so no tint shader is compiled.
    expect(getGlRenderStateRuntime(state).shapeMeshColorScaleBiasShader).toBeUndefined();
  });
});

describe('ensureGlShapeMeshProgram', () => {
  it('compiles once and caches the binding per context', () => {
    const { state } = createGlState();
    const first = ensureGlShapeMeshProgram(state);
    const second = ensureGlShapeMeshProgram(state);
    expect(second).toBe(first);
  });

  it('exposes shared vertex and index buffers for the draw driver', () => {
    const { state } = createGlState();
    const binding = ensureGlShapeMeshProgram(state);
    expect(binding.vertexBuffer).toBeDefined();
    expect(binding.indexBuffer).toBeDefined();
    expect(binding.vertexBuffer).not.toBe(binding.indexBuffer);
  });
});
