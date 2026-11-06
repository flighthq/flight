import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Path } from '@flighthq/path/contract';

export interface FontResource extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  family: string;
  face: FontFace | null;
}

export interface FontUrl {
  format?: string;
  url: string;
}

export interface HostFontLoadingCapability {
  addFontFace(face: FontFace): void;
  checkFontFace(shorthand: string): boolean;
  loadFontFaces(shorthand: string): Promise<FontFace[]>;
  whenReady(): Promise<void>;
}

// Shared vertical line metrics for a glyph source, in pixels at the source's size.
export interface GlyphMetrics {
  ascent: number;
  descent: number;
  lineGap: number;
}

export interface GlyphRasterizedBitmap {
  advance: number;
  bearingX: number;
  bearingY: number;
  height: number;
  pixels: Uint8Array<ArrayBuffer>;
  width: number;
}

export interface GlyphRasterizeOptions {
  fontFamily: string;
  fontSize: number;
  fontStyle?: string;
  fontWeight?: number | string;
}

export interface HostGlyphRasterizerCapability {
  rasterize(codepoint: number, options: Readonly<GlyphRasterizeOptions>): GlyphRasterizedBitmap | null;
  measureMetrics?(options: Readonly<GlyphRasterizeOptions>): GlyphMetrics | null;
}

export type GlyphRasterizerOperation = keyof HostGlyphRasterizerCapability;

// Font-wide vertical metrics in the design-unit coordinate space of a GlyphOutlineSource.
export interface GlyphOutlineMetrics {
  ascent: number;
  descent: number;
  lineGap: number;
  unitsPerEm: number;
}

// An index-keyed vector-font seam. Missing codepoints map to -1; an empty-but-present glyph returns
// true with an empty path so its advance remains observable.
export interface GlyphOutlineSource {
  getGlyphOutline(out: Path, glyphIndex: number): boolean;
  getGlyphOutlineAdvance(glyphIndex: number): number;
  getGlyphOutlineIndexForCodePoint(codePoint: number): number;
  getGlyphOutlineMetrics(): Readonly<GlyphOutlineMetrics>;
}
