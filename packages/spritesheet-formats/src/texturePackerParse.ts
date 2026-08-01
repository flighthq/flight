import type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet/contract';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet/contract';
import { parseTextureAtlasPackerDocument } from '@flighthq/textureatlas-formats/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type {
  TextureAtlasRegion,
  TexturePackerDocument,
  TexturePackerFrameTag,
  TexturePackerMeta,
  TexturePackerParsed,
} from '@flighthq/types/contract';

// ─── Internal helpers ────────────────────────────────────────────────────────

// Maps an atlas region (geometry owned by @flighthq/textureatlas-formats — the single source of truth
// for the region rect, rotation, and trim handling) to a spritesheet frame. This package adds only the
// animation/frame metadata on top. The untrimmed source size falls back to the region rect, because the
// atlas parser leaves originalW/H null when a frame is not trimmed (where the source equals the frame).
function frameFromRegion(region: Readonly<TextureAtlasRegion>): SpritesheetFrameData {
  return createSpritesheetFrameData({
    height: region.height,
    name: region.name ?? '',
    offsetX: region.sourceX,
    offsetY: region.sourceY,
    pivotX: region.pivotX,
    pivotY: region.pivotY,
    rotated: region.rotated,
    sourceHeight: region.originalHeight ?? region.height,
    sourceWidth: region.originalWidth ?? region.width,
    width: region.width,
    x: region.x,
    y: region.y,
  });
}

function animationsFromFrameTags(tags: TexturePackerFrameTag[], frameNames: string[]): SpritesheetAnimationData[] {
  return tags.map((tag) =>
    createSpritesheetAnimationData({
      direction: tag.direction ?? 'forward',
      frameDuration: 100,
      frameNames: frameNames.slice(tag.from, tag.to + 1),
      name: tag.name,
      repeatCount: -1,
    }),
  );
}

function metaScale(meta: TexturePackerMeta): number {
  if (typeof meta.scale === 'string') return parseFloat(meta.scale) || 1;
  return meta.scale;
}

function documentToData(doc: TexturePackerDocument): SpritesheetData {
  // Delegate region geometry to the atlas-formats parser (the TexturePacker document shapes are shared),
  // then layer the spritesheet frame/animation metadata on top — no independent re-parse of the frames.
  const regions = parseTextureAtlasPackerDocument(doc, createTextureAtlas()).regions;
  const frames: SpritesheetFrameData[] = regions.map(frameFromRegion);
  const frameNames: string[] = regions.map((region) => region.name ?? '');

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
 *  Use `parseTexturePackerSpritesheetDocument` instead when you need round-trip serialisation. */
export function parseTexturePackerSpritesheet(json: string): SpritesheetData {
  let document: TexturePackerDocument;
  try {
    document = JSON.parse(json) as TexturePackerDocument;
  } catch {
    // Malformed JSON is an expected failure — return an empty SpritesheetData sentinel rather than
    // throwing an uncaught SyntaxError, matching `parseSpritesheet`'s null-on-unrecognized philosophy and
    // the never-throw importer policy.
    return createSpritesheetData();
  }
  return documentToData(document);
}

/** Parse a Texture Packer JSON string and preserve the full document for
 *  round-trip serialisation via `serializeTexturePackerSpritesheet`. */
export function parseTexturePackerSpritesheetDocument(json: string): TexturePackerParsed {
  let document: TexturePackerDocument;
  try {
    document = JSON.parse(json) as TexturePackerDocument;
  } catch {
    // Malformed JSON is an expected failure — return an EMPTY RESULT (empty data + empty document), never
    // throwing; empty (not null) matches the non-Document sibling parseTexturePackerSpritesheet.
    return { data: createSpritesheetData(), document: createEmptyTexturePackerDocument() };
  }
  return { data: documentToData(document), document };
}

// The frame-less TexturePacker document used as the malformed-JSON sentinel — a valid array document so the
// result round-trips through serializeTexturePackerSpritesheet.
function createEmptyTexturePackerDocument(): TexturePackerDocument {
  const meta: TexturePackerMeta = { app: '', format: '', image: '', scale: 1, size: { h: 0, w: 0 }, version: '' };
  return { frames: [], meta };
}
