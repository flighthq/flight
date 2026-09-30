import type { PlatformEndianness, WgpuUniformEndiannessExplanation } from '@flighthq/types/contract';

// WGPU uniform buffers use a Uint32Array/Int32Array view over a Float32Array's backing buffer to
// write integer values (boolean flags, enum selects) alongside float uniforms. The two views share
// the same ArrayBuffer, so the byte layout is host-determined. This has been validated on
// little-endian hosts only; a big-endian or unknown host may still produce correct output (CPU and
// GPU share byte order on the same hardware), but the result is unvalidated.
export function explainWgpuUniformEndianness(): WgpuUniformEndiannessExplanation {
  const endianness = probeEndianness();
  return { endianness, status: endianness === 'little' ? 'validated' : 'unvalidated' };
}

function probeEndianness(): PlatformEndianness {
  try {
    const buf = new ArrayBuffer(2);
    new Uint16Array(buf)[0] = 0x0102;
    const bytes = new Uint8Array(buf);
    if (bytes[0] === 0x01) return 'big';
    if (bytes[0] === 0x02) return 'little';
  } catch {
    // ArrayBuffer unavailable.
  }
  return 'unknown';
}
