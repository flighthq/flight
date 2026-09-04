import type { MaterialData } from './Material';

// Compact per-item color-adjustment datum used by QuadBatch and Tilemap. The packed value follows the
// SDK's 0xRRGGBBAA convention and realizes as a normalized four-byte multiplier attribute/storage
// word. It is deliberately material data, not a material identity, so tinted and untinted items
// remain co-batched.
export interface TintMaterialData extends MaterialData {
  readonly tint: number;
}
