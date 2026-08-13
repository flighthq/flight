import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('installWgpuMock', () => {
  it('accepts aligned writeBuffer data using typed-array element units', async () => {
    const state = await createWgpuRenderStateForTest();
    const buffer = state.device.createBuffer({ size: 8, usage: GPUBufferUsage.COPY_DST });

    expect(() => state.device.queue.writeBuffer(buffer, 0, new Uint16Array([0, 1, 2]), 0, 2)).not.toThrow();
  });

  it('rejects writeBuffer content whose byte length is not a multiple of four', async () => {
    const state = await createWgpuRenderStateForTest();
    const buffer = state.device.createBuffer({ size: 8, usage: GPUBufferUsage.COPY_DST });

    expect(() => state.device.queue.writeBuffer(buffer, 0, new Uint16Array([0, 1, 2]))).toThrow(
      expect.objectContaining({ name: 'OperationError' }),
    );
  });

  it('rejects writeBuffer source ranges and destination offsets outside the API contract', async () => {
    const state = await createWgpuRenderStateForTest();
    const buffer = state.device.createBuffer({ size: 8, usage: GPUBufferUsage.COPY_DST });

    expect(() => state.device.queue.writeBuffer(buffer, 0, new Uint32Array([0]), 2)).toThrow(
      /data range is out of bounds/,
    );
    expect(() => state.device.queue.writeBuffer(buffer, 2, new Uint32Array([0]))).toThrow(
      /bufferOffset must be a non-negative multiple of 4/,
    );
  });

  it('rejects writeBuffer destinations without enough COPY_DST storage', async () => {
    const state = await createWgpuRenderStateForTest();
    const tooSmall = state.device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST });
    const wrongUsage = state.device.createBuffer({ size: 8, usage: GPUBufferUsage.VERTEX });

    expect(() => state.device.queue.writeBuffer(tooSmall, 0, new Uint32Array([0, 1]))).toThrow(
      /destination range exceeds the buffer size/,
    );
    expect(() => state.device.queue.writeBuffer(wrongUsage, 0, new Uint32Array([0]))).toThrow(
      /must have COPY_DST usage/,
    );
  });
});
