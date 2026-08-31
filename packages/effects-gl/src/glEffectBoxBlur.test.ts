import * as renderGlContract from '@flighthq/render-gl/contract';

import { applyGlEffectBoxBlur } from './glEffectBoxBlur';

const glMock = {
  ONE: 1,
  ZERO: 0,
  blendFunc: vi.fn(),
  uniform1f: vi.fn(),
  uniform2f: vi.fn(),
  uniform4f: vi.fn(),
};

beforeEach(() => {
  vi.spyOn(renderGlContract, 'compileGlFullscreenProgram').mockImplementation(((_gl: unknown, _source: string) => ({
    program: {},
    vao: {},
  })) as never);
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation(((
    _state: never,
    _loc: never,
    _textures: never,
    _dest: never,
    setUniforms: (gl: never, program: never) => void,
  ) => {
    setUniforms(glMock as never, {} as never);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
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

function createState(): never {
  return { gl: { getUniformLocation: vi.fn((_program, name) => name) } } as never;
}

function createTarget(id: string): never {
  return { id, width: 32, height: 16, format: 'rgba8', texture: {} } as never;
}
