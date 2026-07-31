import type * as GlEffectBoxBlurModule from './glEffectBoxBlur';

// Mocked per file with doMock plus a dynamic import of the subject, not a top-level hoisted vi.mock.
// The suite runs isolate:false over a shared module registry, so a hoisted mock is registered for
// every file in the worker rather than this one -- see the rule in the root vitest config.
const glMock = {
  ONE: 1,
  ZERO: 0,
  blendFunc: vi.fn(),
  uniform1f: vi.fn(),
  uniform2f: vi.fn(),
  uniform4f: vi.fn(),
};

let applyGlEffectBoxBlur: typeof GlEffectBoxBlurModule.applyGlEffectBoxBlur;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('@flighthq/render-gl/contract', () => ({
    compileGlFullscreenProgram: vi.fn(() => ({ program: {}, vao: {} })),
    drawGlFullscreenPass: vi.fn((_state, _loc, _textures, _dest, setUniforms) => {
      setUniforms(glMock as never, {} as never);
    }),
  }));
  ({ applyGlEffectBoxBlur } = await import('./glEffectBoxBlur'));
});

describe('applyGlEffectBoxBlur', () => {
  it('is a function', () => {
    expect(typeof applyGlEffectBoxBlur).toBe('function');
  });

  it('binds the exterior edge color when one is provided', () => {
    applyGlEffectBoxBlur(createState(), createTarget('source'), createTarget('dest'), createTarget('temp'), {
      blurX: 4,
      blurY: 0,
      edgeColor: [0.1, 0.2, 0.3, 0.4],
      passes: 1,
    });

    expect(glMock.uniform4f).toHaveBeenNthCalledWith(1, 'u_edgeColor', 0.1, 0.2, 0.3, 0.4);
    expect(glMock.uniform1f).toHaveBeenCalledWith('u_useEdgeColor', 1);
    expect(glMock.blendFunc).toHaveBeenCalledWith(glMock.ONE, glMock.ZERO);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.doUnmock('@flighthq/render-gl/contract');
  vi.resetModules();
});

function createState(): never {
  return { gl: { getUniformLocation: vi.fn((_program, name) => name) } } as never;
}

function createTarget(id: string): never {
  return { id, width: 32, height: 16, format: 'rgba8', texture: {} } as never;
}
