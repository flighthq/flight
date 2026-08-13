import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';

import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

describe('makeWgpuScene3DState', () => {
  it('records aligned writeBuffer data using typed-array element units', () => {
    const { fake, state } = makeWgpuScene3DState();

    state.device.queue.writeBuffer({} as GPUBuffer, 0, new Uint16Array([0, 1, 2]), 0, 2);

    expect(fake.calls.filter((call) => call.name === 'writeBuffer')).toHaveLength(1);
  });

  it('rejects a writeBuffer ArrayBuffer byte size that is not a multiple of four', () => {
    const { fake, state } = makeWgpuScene3DState();
    const data = new Uint16Array([0, 1, 2]);

    expect(() =>
      state.device.queue.writeBuffer({} as GPUBuffer, 0, data.buffer, data.byteOffset, data.byteLength),
    ).toThrow(expect.objectContaining({ name: 'OperationError' }));
    expect(fake.calls.some((call) => call.name === 'writeBuffer')).toBe(false);
  });

  it('rejects a writeBuffer typed-array element count whose bytes are not a multiple of four', () => {
    const { state } = makeWgpuScene3DState();

    expect(() => state.device.queue.writeBuffer({} as GPUBuffer, 0, new Uint16Array([0, 1, 2]))).toThrow(
      expect.objectContaining({ name: 'OperationError' }),
    );
  });

  it('rejects a writeBuffer destination offset that is not aligned to four bytes', () => {
    const { state } = makeWgpuScene3DState();

    expect(() => state.device.queue.writeBuffer({} as GPUBuffer, 2, new Uint32Array([0]))).toThrow(
      /destination offset must be aligned to 4 bytes/,
    );
  });

  it('rejects misaligned or out-of-range index buffer bindings', () => {
    const { fake, state } = makeWgpuScene3DState();
    const buffer = state.device.createBuffer({ size: 8, usage: GPUBufferUsage.INDEX });
    const pass = getWgpuRenderStateRuntime(state).renderPass!;

    expect(() => pass.setIndexBuffer(buffer, 'uint16', -2)).toThrow(/offset and size must be non-negative/);
    expect(() => pass.setIndexBuffer(buffer, 'uint32', 2)).toThrow(/offset must be aligned to 4 bytes/);
    expect(() => pass.setIndexBuffer(buffer, 'uint16', 6, 4)).toThrow(/range exceeds the buffer size/);
    expect(fake.calls.some((call) => call.name === 'setIndexBuffer')).toBe(false);

    pass.setIndexBuffer(buffer, 'uint16', 2, 4);
    expect(fake.calls.filter((call) => call.name === 'setIndexBuffer')).toHaveLength(1);
  });

  it('rejects misaligned or out-of-range vertex buffer bindings', () => {
    const { fake, state } = makeWgpuScene3DState();
    const buffer = state.device.createBuffer({ size: 8, usage: GPUBufferUsage.VERTEX });
    const pass = getWgpuRenderStateRuntime(state).renderPass!;

    expect(() => pass.setVertexBuffer(0, buffer, 0, -4)).toThrow(/offset and size must be non-negative/);
    expect(() => pass.setVertexBuffer(0, buffer, 2)).toThrow(/offset must be aligned to 4 bytes/);
    expect(() => pass.setVertexBuffer(0, buffer, 4, 8)).toThrow(/range exceeds the buffer size/);
    expect(fake.calls.some((call) => call.name === 'setVertexBuffer')).toBe(false);

    pass.setVertexBuffer(0, buffer, 4, 4);
    expect(fake.calls.filter((call) => call.name === 'setVertexBuffer')).toHaveLength(1);
  });

  it('rejects writeTexture data smaller than an rgba8 copy requires', () => {
    const { fake, state } = makeWgpuScene3DState();
    const texture = state.device.createTexture({
      size: [2, 2, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST,
    });

    expect(() =>
      state.device.queue.writeTexture({ texture }, new Uint8Array(15), { bytesPerRow: 8, rowsPerImage: 2 }, [2, 2, 1]),
    ).toThrow(expect.objectContaining({ name: 'OperationError' }));
    expect(fake.calls.some((call) => call.name === 'writeTexture')).toBe(false);

    state.device.queue.writeTexture({ texture }, new Uint8Array(16), { bytesPerRow: 8, rowsPerImage: 2 }, [2, 2, 1]);
    expect(fake.calls.filter((call) => call.name === 'writeTexture')).toHaveLength(1);
  });
});
