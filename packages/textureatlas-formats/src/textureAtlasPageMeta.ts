import type { TextureAtlas } from '@flighthq/types/contract';

// TexturePacker writes `meta.scale` as a string ("0.5"); Aseprite omits it. A value that does not
// parse leaves the atlas at 1 rather than NaN, which would silently poison every coordinate a
// consumer rescaled by it.
export function readTextureAtlasScale(scale: string | number | undefined): number {
  if (scale === undefined) return 1;
  const parsed = typeof scale === 'number' ? scale : Number.parseFloat(scale);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// Every parser clears `atlas.regions` before filling them; the page metadata has to be cleared on the
// same terms, or reparsing a document that declares none leaves the previous one's image name and
// scale attached to the new regions. One helper so the four parsers cannot disagree about what
// "unknown" is.
export function resetTextureAtlasPageMeta(atlas: TextureAtlas): void {
  atlas.imageHeight = 0;
  atlas.imageName = null;
  atlas.imageWidth = 0;
  atlas.scale = 1;
}
