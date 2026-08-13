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
});
