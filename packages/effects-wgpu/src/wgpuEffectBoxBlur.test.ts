const mockState = vi.hoisted(() => ({
  uniformSnapshots: [] as number[][],
}));

vi.hoisted(() => {
  vi.resetModules();
});

vi.mock('./wgpuEffectPass', () => ({
  createWgpuEffectPipeline: vi.fn(() => ({ blendMode: 'replace', pipeline: {} })),
  drawWgpuEffectPass: vi.fn((_state, _source, _dest, _pipeline, setUniforms) => {
    const f32 = new Float32Array(16);
    const i32 = new Int32Array(f32.buffer);
    setUniforms(f32, i32);
    mockState.uniformSnapshots.push(Array.from(f32));
  }),
}));

import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { createWgpuEffectPipeline, drawWgpuEffectPass } from './wgpuEffectPass';

describe('applyWgpuEffectBoxBlur', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectBoxBlur).toBe('function');
  });

  it('binds the exterior edge color when one is provided', () => {
    applyWgpuEffectBoxBlur(createState(), createTarget('source'), createTarget('dest'), createTarget('temp'), {
      blurX: 4,
      blurY: 0,
      edgeColor: [0.1, 0.2, 0.3, 0.4],
      passes: 1,
    });

    expect(createWgpuEffectPipeline).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'replace');
    expect(mockState.uniformSnapshots[0]![4]).toBeCloseTo(0.1);
    expect(mockState.uniformSnapshots[0]![5]).toBeCloseTo(0.2);
    expect(mockState.uniformSnapshots[0]![6]).toBeCloseTo(0.3);
    expect(mockState.uniformSnapshots[0]![7]).toBeCloseTo(0.4);
    expect(mockState.uniformSnapshots[0]![9]).toBe(1);
  });

  it('uses the replacement blur pipeline for zero-radius copies', () => {
    const dest = createTarget('dest');

    applyWgpuEffectBoxBlur(createState(), createTarget('source'), dest, createTarget('temp'), {
      blurX: 0,
      blurY: 0,
      passes: 1,
    });

    expect(drawWgpuEffectPass).toHaveBeenCalledTimes(1);
    expect(vi.mocked(drawWgpuEffectPass).mock.calls[0]![2]).toBe(dest);
    expect(mockState.uniformSnapshots[0]![8]).toBe(0);
    expect(mockState.uniformSnapshots[0]![9]).toBe(0);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockState.uniformSnapshots.length = 0;
});

afterAll(() => {
  vi.doUnmock('./wgpuEffectPass');
  vi.resetModules();
});

function createState(): never {
  return {} as never;
}

function createTarget(id: string): never {
  return { id, width: 32, height: 16, format: 'rgba8', texture: {}, view: {} } as never;
}
