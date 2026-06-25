// libGDX / Spine text-format atlas schema.
// Reference: https://libgdx.com/wiki/tools/texture-packer#atlas-file-format
// The .atlas / pack.atlas text format is widely used across libGDX, Spine, and related tooling.
// A file may contain multiple pages, each beginning with a blank line followed by the image filename.

export interface LibgdxAtlasDocument {
  pages: LibgdxAtlasPage[];
}

export interface LibgdxAtlasPage {
  /** Texture filter for downscaling. */
  filterMag: string;
  /** Texture filter for upscaling. */
  filterMin: string;
  /** Pixel format string (e.g. 'RGBA8888'). */
  format: string;
  /** Relative path to the atlas image file for this page. */
  imageFile: string;
  /** Regions packed onto this page. */
  regions: LibgdxAtlasRegion[];
  /** Texture repeat mode. */
  repeat: string;
  /** Atlas image dimensions [width, height]. */
  size: [number, number];
}

export interface LibgdxAtlasRegion {
  /** Zero-based sequential index for animation grouping (-1 when unused). */
  index: number;
  /** Region name as written in the atlas. */
  name: string;
  /** Packed [x, y] position used for 9-patch or trim (same as xy when untrimmed). */
  offset: [number, number];
  /** Offset from original image top-left to the trimmed content [x, y]. */
  orig: [number, number];
  /** [originalWidth, originalHeight] of the region before trimming. */
  origSize: [number, number];
  /** Whether the region is rotated 90° CCW in the atlas. */
  rotate: boolean;
  /** [width, height] of the region in the atlas. */
  size: [number, number];
  /** [x, y] position of the region in the atlas. */
  xy: [number, number];
}
