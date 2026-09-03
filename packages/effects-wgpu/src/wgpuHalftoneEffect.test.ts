import { createHalftoneEffect } from '@flighthq/effects/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { HalftoneEffect, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

import * as wgpuEffectPassModule from './wgpuEffectPass';
import * as wgpuEffectProgramCacheModule from './wgpuEffectProgramCache';

let recorded = {
  pipelines: [] as { blend: string; key: string; wgsl: string }[],
  uniforms: [] as number[][],
};

beforeEach(() => {
  recorded = {
    pipelines: [],
    uniforms: [],
  };

  vi.spyOn(wgpuEffectPassModule, 'drawWgpuEffectPass').mockImplementation(((
    _state: unknown,
    _source: unknown,
    _dest: unknown,
    _pipeline: unknown,
    setUniforms: (f32: Float32Array) => void,
  ) => {
    const f32 = new Float32Array(4);
    setUniforms(f32);
    recorded.uniforms.push([...f32]);
  }) as never);

  vi.spyOn(wgpuEffectProgramCacheModule, 'getWgpuEffectPipeline').mockImplementation(((
    _state: unknown,
    key: string,
    wgsl: string,
    blend: string,
  ) => {
    recorded.pipelines.push({ blend, key, wgsl });
    return { pipeline: {} };
  }) as never);
});

afterEach(() => vi.restoreAllMocks());

import {
  applyHalftoneEffectToWgpu,
  defaultWgpuHalftoneEffectRunner,
  registerWgpuHalftoneEffect,
} from './wgpuHalftoneEffect';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

beforeAll(() => installWgpuMock());

const SOURCE_WIDTH = 128;
const SOURCE_HEIGHT = 64;

function apply(effect: Readonly<Partial<HalftoneEffect>> = {}): readonly number[] {
  recorded.pipelines.length = 0;
  recorded.uniforms.length = 0;
  const target = { height: SOURCE_HEIGHT, view: {}, width: SOURCE_WIDTH } as unknown as WgpuRenderTarget;
  applyHalftoneEffectToWgpu({} as unknown as WgpuRenderState, target, target, createHalftoneEffect(effect));
  return recorded.uniforms[0]!;
}

// ★ A LOCAL EVALUATOR, and deliberately not the shared one. effects-gl has `evaluateGlslScalarExpression`
// for exactly this, but effects-wgpu must not take a dependency on effects-gl to borrow a test helper —
// the packages are siblings. The subset needed here is one line: the wrap is component-wise, so
// evaluating it per component with scalar bindings is faithful to what the shader computes.
function evaluateWgslScalarExpression(expression: string, bindings: Readonly<Record<string, number>>): number {
  let text = expression;
  for (const name of Object.keys(bindings).sort((left, right) => right.length - left.length)) {
    text = text.split(name).join(`(${bindings[name]!})`);
  }
  for (const token of text.match(/[A-Za-z_]\w*/g) ?? []) {
    if (token !== 'floor') throw new Error(`no binding for '${token}' in: ${expression}`);
  }
  return new Function(`"use strict"; const floor = Math.floor; return (${text});`)() as number;
}

function wrapExpression(): string {
  apply();
  const wgsl = recorded.pipelines[0]!.wgsl;
  const match = /let wrapped = ([^;]+);/.exec(wgsl);
  if (match === null) throw new Error('halftone shader lost its `wrapped` binding');
  return match[1]!.trim();
}

function wrapAt(coordinate: number, cellSize: number): number {
  return evaluateWgslScalarExpression(wrapExpression(), { rp: coordinate, scale: cellSize });
}

describe('applyHalftoneEffectToWgpu', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR — branch 1, restorable from git. The cell coordinate
  // was `rp % vec2f(uni.u_scale)`, and WGSL's `%` on floats is a REMAINDER that follows the sign of its
  // left operand. The grid is rotated before it is wrapped, so `rp` goes negative over a large part of
  // any frame; there the remainder is negative, `cell` lands a whole cell away from centre, `dist`
  // exceeds every radius, and the dots simply stop being drawn. The picture is still a halftone — just
  // with a blank wedge. Replaced with a floor-based Euclidean wrap in 55aa4ccb6.
  //
  // MEASURED by restoring 55aa4ccb6^'s exact line `let cell = (rp % vec2f(uni.u_scale)) - uni.u_scale *
  // 0.5;` — 3 of 10 failed, all three wrap tests:
  //   Error: halftone shader lost its `wrapped` binding
  //   Error: halftone shader lost its `wrapped` binding
  //   Error: halftone shader lost its `wrapped` binding
  // ★ SAID PLAINLY RATHER THAN OVERCLAIMED: the restored line has no `wrapped` binding at all, so these
  // fail because the extractor refuses to measure a shader that no longer computes a wrap — not because
  // it computed a different NUMBER. That is a real failure and a loud one (the alternative, a silently
  // unmatched anchor, would have passed while asserting nothing), but the numeric claims below stand on
  // the current spelling. A rewrite that keeps a `wrapped` binding and gets the sign wrong is caught
  // numerically; one that removes it is caught structurally.
  it('wraps a negative coordinate into the cell, not to a negative remainder', () => {
    // Where a truncated remainder would give -1, the Euclidean wrap gives 5.
    expect(wrapAt(-1, 6)).toBeCloseTo(5, 10);
    expect(wrapAt(-7, 6)).toBeCloseTo(5, 10);
  });

  it('keeps every wrapped coordinate inside one cell, on both sides of the origin', () => {
    for (const coordinate of [-13.5, -6, -0.25, 0, 0.25, 6, 13.5]) {
      const wrapped = wrapAt(coordinate, 6);

      expect(wrapped).toBeGreaterThanOrEqual(0);
      expect(wrapped).toBeLessThan(6);
    }
  });

  it('agrees with a remainder where the coordinate is positive, which is why the defect hid', () => {
    expect(wrapAt(7, 6)).toBeCloseTo(7 % 6, 10);
    expect(wrapAt(13.5, 6)).toBeCloseTo(13.5 % 6, 10);
  });

  // ★ THE ANGLE IS DEGREES ON THE DESCRIPTOR AND RADIANS IN THE SHADER, converted at this seam. The
  // field carried radians until it was unified with the rest of the SDK, and nothing in the type says
  // which — a 22.92 read as radians is a grid rotated seven and a bit turns, which looks like a
  // different, arbitrary angle rather than like a bug.
  it('converts the descriptor angle from degrees into shader radians', () => {
    expect(apply({ angle: 90 })[1]).toBeCloseTo(Math.PI / 2, 6);
    expect(apply({ angle: 180 })[1]).toBeCloseTo(Math.PI, 6);
    expect(apply({ angle: 0 })[1]).toBe(0);
  });

  it('defaults to the classic screen angle, in degrees', () => {
    expect(apply()[1]).toBeCloseTo((22.92 * Math.PI) / 180, 6);
  });

  // A cell smaller than a pixel divides the dot radius by zero-ish and produces a solid field; the floor
  // keeps a degenerate `scale` from turning the effect into a black frame.
  it('floors the cell size at one pixel', () => {
    expect(apply({ scale: 0 })[0]).toBe(1);
    expect(apply({ scale: -4 })[0]).toBe(1);
    expect(apply({ scale: 6 })[0]).toBe(6);
  });

  // The grid is laid out in PIXELS, so the shader needs the source's dimensions; without them the cell
  // size would be in uv units and the grid would stretch with the frame.
  it('gives the shader the source resolution the grid is laid out in', () => {
    const uniforms = apply();

    expect(uniforms[2]).toBe(SOURCE_WIDTH);
    expect(uniforms[3]).toBe(SOURCE_HEIGHT);
  });

  it('draws through one replace-blend pipeline for every parameterisation', () => {
    apply({ scale: 4 });
    const first = recorded.pipelines[0]!;
    apply({ scale: 12 });

    expect(recorded.pipelines[0]!.key).toBe(first.key);
    expect(first.key).toBe('stylization.halftone');
    expect(first.blend).toBe('replace');
  });
});

describe('defaultWgpuHalftoneEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    recorded.uniforms.length = 0;
    const target = { height: 8, view: {}, width: 8 } as unknown as WgpuRenderTarget;

    defaultWgpuHalftoneEffectRunner(
      { dest: target, pool: {}, source: target, state: {} } as never,
      createHalftoneEffect({ angle: 90 }),
    );

    expect(recorded.uniforms[0]![1]).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('registerWgpuHalftoneEffect', () => {
  it('makes the runner resolvable for the HalftoneEffect kind', async () => {
    const state = await createWgpuRenderStateForTest();

    expect(getWgpuRenderEffectRunner(state, 'HalftoneEffect')).toBeNull();
    registerWgpuHalftoneEffect(state);
    expect(getWgpuRenderEffectRunner(state, 'HalftoneEffect')).toBe(defaultWgpuHalftoneEffectRunner);
  });
});
