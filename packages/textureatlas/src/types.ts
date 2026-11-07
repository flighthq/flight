// Texture-atlas contracts and their nominal runtime values are owned here. Keeping the rotation enum in
// this contract project lets every consumer use the same value.

import type { EntityRaw, EntityRuntime, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Texture2D } from '@flighthq/texture/contract';

export enum TextureAtlasRotation {
  Counterclockwise90 = -1,
  None = 0,
  Clockwise90 = 1,
}

interface TextureAtlasEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export interface TextureAtlasRegion extends TextureAtlasEntity {
  // Packed page-rectangle extent. When rotation is not None, logical drawn width/height are
  // height/width.
  height: number;
  id: number;
  name: string | null;
  originalHeight: number | null;
  originalWidth: number | null;
  // Which page image this region was packed into, for formats that carry several. A multi-page
  // libGDX atlas concatenates every page's regions into one atlas, so without this the caller cannot
  // tell them apart. Null when the format declares one page or none.
  pageName: string | null;
  pivotX: number | null;
  pivotY: number | null;
  // Cardinal quarter-turn applied by the packer. The single enum is both the rotation flag and its
  // direction, so these cannot disagree.
  rotation: TextureAtlasRotation;
  sourceX: number;
  sourceY: number;
  trimmed: boolean;
  x: number;
  y: number;
  // Packed page-rectangle extent. See height.
  width: number;
}

export type TextureAtlasRegionLike = EntityWithoutRuntime<TextureAtlasRegion>;

export interface TextureAtlas extends TextureAtlasEntity {
  // Page metadata the descriptor formats carry and a consumer needs after parsing: the image file to
  // fetch, and the dimensions getTextureAtlasRegionUv divides by. Zero width or height means the
  // document declared none — Starling XML carries no atlas metadata at all — and is deliberately not
  // a plausible-looking size a UV caller would use without checking.
  imageHeight: number;
  imageName: string | null;
  imageWidth: number;
  regions: TextureAtlasRegion[];
  // The scale the atlas was exported at (TexturePacker `meta.scale`). 1 when undeclared.
  scale: number;
  texture: Texture2D | null;
}

export interface GridSliceOptions {
  /** Number of columns in the grid. */
  columns: number;
  /** Height of each frame in pixels. Derived from imageHeight, rows, margin, and spacing when omitted. */
  frameHeight?: number;
  /** Width of each frame in pixels. Derived from imageWidth, columns, margin, and spacing when omitted. */
  frameWidth?: number;
  /** Relative path or URL to the atlas image file. */
  imageFile: string;
  /** Total height of the atlas image in pixels. */
  imageHeight: number;
  /** Total width of the atlas image in pixels. */
  imageWidth: number;
  /** Uniform outer margin on all sides in pixels. Defaults to 0. */
  marginX?: number;
  /** Uniform outer margin on top and bottom in pixels. Defaults to 0. */
  marginY?: number;
  /** Prefix prepended to each generated frame name. Defaults to 'frame_'. */
  namePrefix?: string;
  /** Number of rows in the grid. */
  rows: number;
  /** Horizontal gap between adjacent columns in pixels. Defaults to 0. */
  spacingX?: number;
  /** Vertical gap between adjacent rows in pixels. Defaults to 0. */
  spacingY?: number;
}

export type TextureAtlasRegionTextureStatus = 'ready' | 'missing-region' | 'missing-texture' | 'rotated-page';

export interface TextureAtlasRegionTextureExplanation {
  readonly status: TextureAtlasRegionTextureStatus;
}

export type TextureAtlasRegionTextureGuard = (
  atlas: Readonly<TextureAtlas>,
  regionId: number,
  explanation: Readonly<TextureAtlasRegionTextureExplanation>,
) => void;
