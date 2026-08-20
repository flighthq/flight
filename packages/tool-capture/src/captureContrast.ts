import { parseBitmapFingerprint } from '@flighthq/bitmap/contract';

// The same per-channel units as regression distance, measured from a committed baseline to a uniform
// frame of its own corner colour. It is context for how much structure the gate can see, never a gate.
export function getCaptureFingerprintContrast(fingerprint: string): number | null {
  const parsed = parseBitmapFingerprint(fingerprint);
  if (parsed === null || parsed.cells.length === 0) return null;
  let total = 0;
  for (let index = 0; index < parsed.cells.length; index++) {
    total += Math.abs(parsed.cells[index]! - parsed.cells[index % 3]!);
  }
  return total / parsed.cells.length;
}
