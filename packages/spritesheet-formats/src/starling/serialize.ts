import type { SpritesheetData } from '@flighthq/spritesheet';

import type { StarlingDocument, StarlingSubTexture } from './schema';

// ─── Internal helpers ────────────────────────────────────────────────────────

function frameToSubTexture(frame: Readonly<SpritesheetData['frames'][0]>): StarlingSubTexture {
  const st: StarlingSubTexture = {
    height: frame.height,
    name: frame.name,
    width: frame.width,
    x: frame.x,
    y: frame.y,
  };

  if (frame.offsetX !== 0) st.frameX = -frame.offsetX;
  if (frame.offsetY !== 0) st.frameY = -frame.offsetY;
  if (frame.sourceWidth !== frame.width) st.frameWidth = frame.sourceWidth;
  if (frame.sourceHeight !== frame.height) st.frameHeight = frame.sourceHeight;

  if (frame.pivotX !== null && frame.sourceWidth > 0) {
    st.pivotX = frame.pivotX * frame.sourceWidth;
  }
  if (frame.pivotY !== null && frame.sourceHeight > 0) {
    st.pivotY = frame.pivotY * frame.sourceHeight;
  }

  if (frame.rotated) st.rotated = true;

  return st;
}

function subTextureToAttr(st: StarlingSubTexture): string {
  const parts: string[] = [`name="${st.name}"`, `x="${st.x}"`, `y="${st.y}"`];
  parts.push(`width="${st.width}"`, `height="${st.height}"`);
  if (st.frameX !== undefined) parts.push(`frameX="${st.frameX}"`);
  if (st.frameY !== undefined) parts.push(`frameY="${st.frameY}"`);
  if (st.frameWidth !== undefined) parts.push(`frameWidth="${st.frameWidth}"`);
  if (st.frameHeight !== undefined) parts.push(`frameHeight="${st.frameHeight}"`);
  if (st.pivotX !== undefined) parts.push(`pivotX="${st.pivotX}"`);
  if (st.pivotY !== undefined) parts.push(`pivotY="${st.pivotY}"`);
  if (st.rotated) parts.push(`rotated="true"`);
  return parts.join(' ');
}

function documentToXml(doc: StarlingDocument): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', `<TextureAtlas imagePath="${doc.imagePath}">`];
  for (const st of doc.subTextures) {
    lines.push(`\t<SubTexture ${subTextureToAttr(st)}/>`);
  }
  lines.push('</TextureAtlas>');
  return lines.join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Serialise a SpritesheetData to a Starling / Sparrow XML atlas string.
 *
 *  Pass the `document` returned by `parseStarlingDocument` to preserve any fields that
 *  don't round-trip through the data (pivot values stored in the document). */
export function serializeStarling(data: Readonly<SpritesheetData>, existing?: Partial<StarlingDocument>): string {
  const doc: StarlingDocument = {
    imagePath: data.imageFile || existing?.imagePath || '',
    subTextures: data.frames.map(frameToSubTexture),
  };
  return documentToXml(doc);
}
