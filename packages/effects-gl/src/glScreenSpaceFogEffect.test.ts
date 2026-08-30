import {
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlContextFromCanvasElement,
  createGlRenderState,
} from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget, ScreenSpaceFogEffect } from '@flighthq/types/contract';

const programMock = vi.hoisted(() => ({
  getGlEffectProgram: vi.fn((_state: unknown, _key: string, _source: string) => ({ program: {} })),
}));
const glMock = vi.hoisted(() => ({
  uniform1f: vi.fn((_location: unknown, _value: number) => {}),
  uniform3f: vi.fn((_location: unknown, _x: number, _y: number, _z: number) => {}),
}));
const drawCalls = vi.hoisted(() => ({ inputs: [] as unknown[][] }));

vi.mock('./glEffectProgramCache', () => programMock);

// Partial, not wholesale: `createGlRenderState` and the runtime accessor the registry reaches through
// must stay real, or the registration test below would be asserting against a mock of itself.
vi.mock('@flighthq/render-gl/contract', async () => {
  const actual = (await vi.importActual('@flighthq/render-gl/contract')) as Record<string, unknown>;
  return {
    ...actual,
    drawGlFullscreenPass: vi.fn((_state, _program, textures, _dest, setUniforms) => {
      drawCalls.inputs.push(textures as unknown[]);
      setUniforms({ ...glMock, getUniformLocation: (_p: unknown, name: string) => name }, { program: {} });
    }),
  };
});

import { getGlRenderEffectRunner } from './glRenderEffectRegistry';
import {
  applyScreenSpaceFogEffectToGl,
  defaultGlScreenSpaceFogEffectRunner,
  registerGlScreenSpaceFogEffect,
} from './glScreenSpaceFogEffect';
import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';

function apply(effect: Readonly<Partial<ScreenSpaceFogEffect>> = {}, depthTexture: WebGLTexture | null = null): void {
  programMock.getGlEffectProgram.mockClear();
  glMock.uniform1f.mockClear();
  glMock.uniform3f.mockClear();
  drawCalls.inputs.length = 0;
  const target = { height: 64, texture: { id: 'scene' }, width: 64 } as unknown as GlRenderTarget;
  applyScreenSpaceFogEffectToGl({ gl: {} } as unknown as GlRenderState, target, target, depthTexture, {
    kind: 'ScreenSpaceFogEffect',
    ...effect,
  } as ScreenSpaceFogEffect);
}

// The proxy branch, taken when the scene wrote no depth. Extracted from the `else` arm specifically:
// the depth arm assigns `fog` too, and matching the first assignment would measure the wrong path.
function proxyFogExpression(): string {
  apply();
  const source = programMock.getGlEffectProgram.mock.calls[0]![2] as string;
  return extractGlslExpression(source, /} else \{[\S\s]*?fog = ([^;]+);/);
}

function proxyFogAtTexcoordY(texcoordY: number, density = 1): number {
  return evaluateGlslScalarExpression(proxyFogExpression(), { u_density: density, 'v_texCoord.y': texcoordY });
}

function scalarUniform(name: string): number {
  const call = glMock.uniform1f.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) throw new Error(`no uniform1f call for ${name}`);
  return call[1] as number;
}

describe('applyScreenSpaceFogEffectToGl', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR. The depth-free branch uses screen Y as a depth
  // proxy, and it read `1.0 - v_texCoord.y`. On a bottom-left-origin render target `v_texCoord.y` is
  // ALREADY the distance from the top, so subtracting it from one put the dense fog on the ground and
  // left the horizon clear — a gradient that still looks like fog, in the wrong direction. A type sees
  // nothing, and a mirror comparison sees two gradients.
  //
  // ★ THIS ONE IS THE INVERSE OF ITS SIBLINGS, WHICH IS WHY IT IS WORTH ITS OWN TEST. In crt, glitch and
  // tilt-shift the correct GL form SUBTRACTS FROM ONE; here the correct form does NOT. A rule of thumb
  // like "the GL shader always flips" passes those three and breaks this one, so the assertion below is
  // about where the fog ends up, not about whether an inversion appears.
  //
  // jsdom compiles no GLSL, so the shipped expression is evaluated arithmetically rather than rendered.
  //
  // MEASURED against the defect, by restoring a9f7adccb^'s exact line into the proxy branch — 4 of 10:
  //   AssertionError: expected +0 to be close to 1, received difference is 1
  //   AssertionError: expected 1 to be close to +0, received difference is 1
  //   AssertionError: expected 0.6000000000000001 to be greater than 0.8
  //   AssertionError: expected +0 to be 1 // Object.is equality
  it('puts the densest proxy fog at the TOP of the image', () => {
    expect(proxyFogAtTexcoordY(1)).toBeCloseTo(1, 6);
  });

  it('leaves the bottom of the image clear', () => {
    expect(proxyFogAtTexcoordY(0)).toBeCloseTo(0, 6);
  });

  it('thickens the proxy fog monotonically from the bottom of the image to the top', () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map((texcoordY) => proxyFogAtTexcoordY(texcoordY, 0.8));

    for (let index = 1; index < values.length; index++) expect(values[index]!).toBeGreaterThan(values[index - 1]!);
  });

  it('clamps the proxy fog at full density rather than overshooting', () => {
    expect(proxyFogAtTexcoordY(1, 4)).toBe(1);
  });

  // The other half of the seam this effect exists to demonstrate: a real depth texture is bound as a
  // second input and switches the shader to the exponential path.
  it('binds the depth texture and takes the depth branch when the scene wrote one', () => {
    const depth = { id: 'depth' } as unknown as WebGLTexture;
    apply({}, depth);

    expect(drawCalls.inputs[0]).toHaveLength(2);
    expect(drawCalls.inputs[0]![1]).toBe(depth);
    expect(scalarUniform('u_hasDepth')).toBe(1);
  });

  it('binds the scene alone and takes the proxy branch when there is no depth', () => {
    apply();

    expect(drawCalls.inputs[0]).toHaveLength(1);
    expect(scalarUniform('u_hasDepth')).toBe(0);
  });

  it('unpacks the fog color from packed RGBA, dropping the alpha the shader does not take', () => {
    apply({ color: 0x336699ff });

    const call = glMock.uniform3f.mock.calls.find((entry) => entry[0] === 'u_fogColor')!;
    expect(call[1]).toBeCloseTo(0x33 / 255, 6);
    expect(call[2]).toBeCloseTo(0x66 / 255, 6);
    expect(call[3]).toBeCloseTo(0x99 / 255, 6);
  });

  it('passes the depth window through as descriptor defaults', () => {
    apply();

    expect(scalarUniform('u_density')).toBe(1);
    expect(scalarUniform('u_near')).toBe(0);
    expect(scalarUniform('u_far')).toBe(1);
  });
});

describe('defaultGlScreenSpaceFogEffectRunner', () => {
  // The runner's whole job is forwarding `ctx.sceneDepthTexture` into the depth argument, which is the
  // one thing a caller cannot supply itself.
  it('forwards the scene depth texture from the runner context', () => {
    drawCalls.inputs.length = 0;
    glMock.uniform1f.mockClear();
    const depth = { id: 'ctxDepth' } as unknown as WebGLTexture;
    const target = { height: 8, texture: { id: 'scene' }, width: 8 } as unknown as GlRenderTarget;

    defaultGlScreenSpaceFogEffectRunner(
      {
        dest: target,
        pool: { free: [], inUse: [] },
        sceneDepthTexture: depth,
        source: target,
        state: { gl: {} },
      } as never,
      { kind: 'ScreenSpaceFogEffect' } as ScreenSpaceFogEffect,
    );

    expect(drawCalls.inputs[0]![1]).toBe(depth);
    expect(scalarUniform('u_hasDepth')).toBe(1);
  });
});

describe('registerGlScreenSpaceFogEffect', () => {
  it('makes the runner resolvable for the ScreenSpaceFogEffect kind', () => {
    const state = createGlRenderState(
      createGlContextState(createGlContextFromCanvasElement(document.createElement('canvas'))),
      createGlPipeline(createEmptyGlRegistries()),
    );

    expect(getGlRenderEffectRunner(state, 'ScreenSpaceFogEffect')).toBeNull();
    registerGlScreenSpaceFogEffect(state);
    expect(getGlRenderEffectRunner(state, 'ScreenSpaceFogEffect')).toBe(defaultGlScreenSpaceFogEffectRunner);
  });
});
