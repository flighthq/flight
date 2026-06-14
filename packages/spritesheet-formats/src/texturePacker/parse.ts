import type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet';

import type {
  TexturePackerArrayFrame,
  TexturePackerDocument,
  TexturePackerFrameTag,
  TexturePackerHashFrame,
  TexturePackerMeta,
} from './schema';

export interface TexturePackerParsed {
  data: SpritesheetData;
  document: TexturePackerDocument;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function frameFromEntry(name: string, entry: TexturePackerHashFrame): SpritesheetFrameData {
  return createSpritesheetFrameData({
    height: entry.frame.h,
    name,
    offsetX: entry.spriteSourceSize.x,
    offsetY: entry.spriteSourceSize.y,
    pivotX: entry.pivot !== undefined ? entry.pivot.x : null,
    pivotY: entry.pivot !== undefined ? entry.pivot.y : null,
    rotated: entry.rotated,
    sourceHeight: entry.sourceSize.h,
    sourceWidth: entry.sourceSize.w,
    width: entry.frame.w,
    x: entry.frame.x,
    y: entry.frame.y,
  });
}

function animationsFromFrameTags(tags: TexturePackerFrameTag[], frameNames: string[]): SpritesheetAnimationData[] {
  return tags.map((tag) =>
    createSpritesheetAnimationData({
      direction: tag.direction ?? 'forward',
      frameDuration: 100,
      frameNames: frameNames.slice(tag.from, tag.to + 1),
      loop: true,
      name: tag.name,
    }),
  );
}

function metaScale(meta: TexturePackerMeta): number {
  if (typeof meta.scale === 'string') return parseFloat(meta.scale) || 1;
  return meta.scale;
}

function documentToData(doc: TexturePackerDocument): SpritesheetData {
  const frames: SpritesheetFrameData[] = [];
  const frameNames: string[] = [];

  if (Array.isArray(doc.frames)) {
    for (const entry of doc.frames as TexturePackerArrayFrame[]) {
      frames.push(frameFromEntry(entry.filename, entry));
      frameNames.push(entry.filename);
    }
  } else {
    for (const [name, entry] of Object.entries(doc.frames)) {
      frames.push(frameFromEntry(name, entry));
      frameNames.push(name);
    }
  }

  const { meta } = doc;
  const animations = meta.frameTags ? animationsFromFrameTags(meta.frameTags, frameNames) : [];

  return createSpritesheetData({
    animations,
    frames,
    imageFile: meta.image,
    imageHeight: meta.size.h,
    imageWidth: meta.size.w,
    scale: metaScale(meta),
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a Texture Packer JSON string directly to a SpritesheetData.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Use `parseTexturePackerDocument` instead when you need round-trip serialisation. */
export function parseTexturePacker(json: string): SpritesheetData {
  return documentToData(JSON.parse(json) as TexturePackerDocument);
}

/** Parse a Texture Packer JSON string and preserve the full document for
 *  round-trip serialisation via `serializeTexturePacker`. */
export function parseTexturePackerDocument(json: string): TexturePackerParsed {
  const document = JSON.parse(json) as TexturePackerDocument;
  return { data: documentToData(document), document };
}
