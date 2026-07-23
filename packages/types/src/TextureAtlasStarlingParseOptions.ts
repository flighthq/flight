export interface TextureAtlasStarlingParseOptions {
  /**
   * Atlas image width in pixels. Starling XML omits atlas dimensions; supply to allow UV
   * computation. When omitted, the atlas image dimensions will be used when available.
   */
  imageWidth?: number;
  /**
   * Atlas image height in pixels.
   */
  imageHeight?: number;
}
