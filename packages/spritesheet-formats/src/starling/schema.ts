// Starling / Sparrow spritesheet XML schema — field names as they appear in the file.
// Reference: https://doc.starling-framework.org/current/starling/textures/TextureAtlas.html
// This is the same format used by OpenFL's AssetType.IMAGE texture atlas support and
// is commonly exported by Texture Packer (Starling / Sparrow XML preset).

export interface StarlingSubTexture {
  /** Original untrimmed frame height (present when frame is trimmed). */
  frameHeight?: number;
  /** Original untrimmed frame width (present when frame is trimmed). */
  frameWidth?: number;
  /** Left edge of the visible area within the original frame; typically negative. */
  frameX?: number;
  /** Top edge of the visible area within the original frame; typically negative. */
  frameY?: number;
  /** Height of the atlas rectangle. */
  height: number;
  /** Frame identifier used to look up the sub-texture at runtime. */
  name: string;
  /** Absolute X pivot position in the original frame coordinate space. */
  pivotX?: number;
  /** Absolute Y pivot position in the original frame coordinate space. */
  pivotY?: number;
  /** Whether the frame is rotated 90° CW inside the atlas. */
  rotated?: boolean;
  /** Width of the atlas rectangle. */
  width: number;
  /** Atlas X offset of the rectangle. */
  x: number;
  /** Atlas Y offset of the rectangle. */
  y: number;
}

export interface StarlingDocument {
  /** Relative path to the atlas image file, value of the `imagePath` attribute. */
  imagePath: string;
  subTextures: StarlingSubTexture[];
}
