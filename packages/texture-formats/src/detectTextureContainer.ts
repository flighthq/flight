// Sniffs which GPU texture container a byte buffer holds from its magic bytes — `'ktx2'`, `'dds'`,
// `'basis'`, or `null` when the header is too short or unrecognized. The texture-container sibling of
// `detectImageMimeType`: a cheap dispatcher to pick a `parse*` function without fully parsing, and the
// single point of container identification in the SDK.
export function detectTextureContainer(bytes: Readonly<Uint8Array>): 'basis' | 'dds' | 'ktx2' | null {
  if (bytes.byteLength >= 12 && isKtx2Magic(bytes)) return 'ktx2';
  // DDS: 'DDS ' (0x44 0x44 0x53 0x20)
  if (bytes.byteLength >= 4 && bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x53 && bytes[3] === 0x20) {
    return 'dds';
  }
  // Basis: m_sig 0x4273 little-endian ('s' then 'B')
  if (bytes.byteLength >= 2 && bytes[0] === 0x73 && bytes[1] === 0x42) return 'basis';
  return null;
}

function isKtx2Magic(bytes: Readonly<Uint8Array>): boolean {
  for (let i = 0; i < 12; i += 1) {
    if (bytes[i] !== ktx2Magic[i]) return false;
  }
  return true;
}

// «KTX 20»\r\n\x1A\n
const ktx2Magic: readonly number[] = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
