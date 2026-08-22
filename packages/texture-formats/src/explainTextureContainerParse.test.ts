import { explainTextureContainerParse } from './explainTextureContainerParse';

describe('explainTextureContainerParse', () => {
  it('reports an unrecognized container', () => {
    expect(explainTextureContainerParse(new Uint8Array([0, 1, 2, 3]))).toEqual({
      container: null,
      reason: 'container-unrecognized',
    });
  });

  it.each([
    ['atf', new Uint8Array([0x41, 0x54, 0x46])],
    ['basis', new Uint8Array([0x73, 0x42])],
    ['dds', new Uint8Array([0x44, 0x44, 0x53, 0x20])],
    ['ktx2', new Uint8Array(ktx2Identifier)],
  ] as const)('reports a truncated %s header', (container, bytes) => {
    expect(explainTextureContainerParse(bytes)).toEqual({ container, reason: 'header-truncated' });
  });

  it('distinguishes unsupported formats from invalid structures', () => {
    expect(explainTextureContainerParse(createKtx2({ vkFormat: 999 }))).toEqual({
      container: 'ktx2',
      reason: 'format-unsupported',
    });

    const basis = new Uint8Array(69);
    basis.set([0x73, 0x42]);
    expect(explainTextureContainerParse(basis)).toEqual({
      container: 'basis',
      reason: 'structure-invalid',
    });
  });

  it('reports a level range that overruns the bytes', () => {
    expect(explainTextureContainerParse(createKtx2({ byteLength: 8 }))).toEqual({
      container: 'ktx2',
      reason: 'level-range-out-of-bounds',
    });
  });

  it('returns null when the detected container parses', () => {
    expect(explainTextureContainerParse(createKtx2({ byteLength: 1, payloadBytes: 1 }))).toBeNull();
  });
});

function createKtx2(options: {
  readonly byteLength?: number;
  readonly payloadBytes?: number;
  readonly vkFormat?: number;
}) {
  const bytes = new Uint8Array(104 + (options.payloadBytes ?? 0));
  bytes.set(ktx2Identifier);
  const view = new DataView(bytes.buffer);
  view.setUint32(12, options.vkFormat ?? 37, true);
  view.setUint32(20, 1, true); // pixelWidth
  view.setUint32(24, 1, true); // pixelHeight
  view.setUint32(36, 1, true); // faceCount
  view.setUint32(40, 1, true); // levelCount
  view.setUint32(80, 104, true); // level byteOffset, low u32 of u64
  view.setUint32(88, options.byteLength ?? 0, true); // level byteLength, low u32 of u64
  view.setUint32(96, options.byteLength ?? 0, true); // uncompressedByteLength, low u32 of u64
  return bytes;
}

const ktx2Identifier: readonly number[] = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
