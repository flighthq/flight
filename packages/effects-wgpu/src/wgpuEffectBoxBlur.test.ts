import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import * as wgpuEffectPassMod from './wgpuEffectPass';

const uniformSnapshots: number[][] = [];

beforeEach(() => {
  uniformSnapshots.length = 0;

  vi.spyOn(wgpuEffectPassMod, 'createWgpuEffectPipeline').mockReturnValue({
    blendMode: 'replace',
    pipeline: {},
  } as never);
  vi.spyOn(wgpuEffectPassMod, 'drawWgpuEffectPass').mockImplementation(((
    _state: unknown,
    _source: unknown,
    _dest: unknown,
    _pipeline: unknown,
    setUniforms: Function,
  ) => {
    const f32 = new Float32Array(16);
    const i32 = new Int32Array(f32.buffer);
    setUniforms(f32, i32);
    uniformSnapshots.push(Array.from(f32));
  }) as never);
});

afterEach(() => vi.restoreAllMocks());

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

    expect(wgpuEffectPassMod.createWgpuEffectPipeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'replace',
    );
    expect(uniformSnapshots[0]![4]).toBeCloseTo(0.1);
    expect(uniformSnapshots[0]![5]).toBeCloseTo(0.2);
    expect(uniformSnapshots[0]![6]).toBeCloseTo(0.3);
    expect(uniformSnapshots[0]![7]).toBeCloseTo(0.4);
    expect(uniformSnapshots[0]![9]).toBe(1);
  });

  it('uses the replacement blur pipeline for zero-radius copies', () => {
    const dest = createTarget('dest');

    applyWgpuEffectBoxBlur(createState(), createTarget('source'), dest, createTarget('temp'), {
      blurX: 0,
      blurY: 0,
      passes: 1,
    });

    expect(wgpuEffectPassMod.drawWgpuEffectPass).toHaveBeenCalledTimes(1);
    expect(vi.mocked(wgpuEffectPassMod.drawWgpuEffectPass).mock.calls[0]![2]).toBe(dest);
    expect(uniformSnapshots[0]![8]).toBe(0);
    expect(uniformSnapshots[0]![9]).toBe(0);
  });
});

function createState(): never {
  return {} as never;
}

function createTarget(id: string): never {
  return { id, width: 32, height: 16, format: 'rgba8', texture: {}, view: {} } as never;
}
