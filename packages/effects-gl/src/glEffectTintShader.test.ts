// This pass is the single decode point for every tinted effect on this backend — drop shadow, outer glow,
// and the neutral white field the bevels lay down. That is what the piece-4 unification bought: the
// channel order and the alpha fold are asserted once, here, instead of at each of five call sites.
const glMock = vi.hoisted(() => ({
  ONE: 1,
  ZERO: 0,
  blendFunc: vi.fn(),
  uniform1f: vi.fn(),
  uniform3f: vi.fn(),
}));

vi.mock('@flighthq/render-gl/contract', () => ({
  compileGlFullscreenProgram: vi.fn(() => ({
    locAlpha: 'u_alpha',
    locColor: 'u_color',
    locStrength: 'u_strength',
    program: {},
  })),
  drawGlFullscreenPass: vi.fn((_state, _loc, _textures, _dest, setUniforms) => {
    setUniforms(glMock as never, {} as never);
  }),
}));

import { applyGlEffectInvertTintPass, applyGlEffectTintPass } from './glEffectTintShader';

const state = { gl: { getUniformLocation: (_program: unknown, name: string) => name } } as never;
const target = { height: 4, texture: {}, width: 4 } as never;

describe('applyGlEffectInvertTintPass', () => {
  it('is a function', () => {
    expect(typeof applyGlEffectInvertTintPass).toBe('function');
  });

  it('reads the packed color and folds its alpha, the same contract as the non-inverted pass', () => {
    glMock.uniform3f.mockClear();
    glMock.uniform1f.mockClear();

    applyGlEffectInvertTintPass(state, target, target, 0x9d55ff80, 0.5, 1);

    const [, red, green, blue] = glMock.uniform3f.mock.calls.find((call) => call[0] === 'u_color')!;
    expect(red).toBeCloseTo(0x9d / 255, 5);
    expect(green).toBeCloseTo(0x55 / 255, 5);
    expect(blue).toBeCloseTo(1, 5);
    expect(glMock.uniform1f.mock.calls.find((call) => call[0] === 'u_alpha')![1]).toBeCloseTo((0x80 / 255) * 0.5, 5);
  });
});

describe('applyGlEffectTintPass', () => {
  it('is a function', () => {
    expect(typeof applyGlEffectTintPass).toBe('function');
  });

  it('splits a packed RGBA color into the shader RGB and an alpha multiplied by the caller alpha', () => {
    glMock.uniform3f.mockClear();
    glMock.uniform1f.mockClear();

    applyGlEffectTintPass(state, target, target, 0x9d55ff80, 0.5, 1);

    // Under the 24-bit reading this pass carried before piece 4, the same value tinted 0x55ff80 at a
    // full 0.5 — a different color at twice the opacity, and nothing in the frame to say which was meant.
    const [, red, green, blue] = glMock.uniform3f.mock.calls.find((call) => call[0] === 'u_color')!;
    expect(red).toBeCloseTo(0x9d / 255, 5);
    expect(green).toBeCloseTo(0x55 / 255, 5);
    expect(blue).toBeCloseTo(1, 5);
    expect(glMock.uniform1f.mock.calls.find((call) => call[0] === 'u_alpha')![1]).toBeCloseTo((0x80 / 255) * 0.5, 5);
  });

  it('passes an opaque tint through at exactly the caller alpha', () => {
    glMock.uniform1f.mockClear();

    applyGlEffectTintPass(state, target, target, 0xffffffff, 0.25, 1);

    expect(glMock.uniform1f.mock.calls.find((call) => call[0] === 'u_alpha')![1]).toBeCloseTo(0.25, 5);
  });
});
