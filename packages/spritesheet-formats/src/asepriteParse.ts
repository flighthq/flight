import type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet';
import { createTextureAtlas } from '@flighthq/textureatlas';
import { parseTextureAtlasAsepriteDocument } from '@flighthq/textureatlas-formats';
import type {
  AsepriteArrayFrame,
  AsepriteDocument,
  AsepriteFrameTag,
  AsepriteMeta,
  AsepriteParsed,
  TextureAtlasRegion,
} from '@flighthq/types';

// ─── Internal helpers ────────────────────────────────────────────────────────

// Maps an atlas region (geometry owned by @flighthq/textureatlas-formats) to a spritesheet frame.
// Aseprite carries no pivot; per-frame durations are layered on separately from the document.
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

function metaScale(meta: AsepriteMeta): number {
  if (typeof meta.scale === 'string') return parseFloat(meta.scale) || 1;
  return meta.scale;
}

function animationFromTag(
  tag: AsepriteFrameTag,
  frameNames: string[],
  durationMap: Map<string, number>,
): SpritesheetAnimationData {
  const tagFrameNames = frameNames.slice(tag.from, tag.to + 1);
  const durations = tagFrameNames.map((n) => durationMap.get(n) ?? 100);
  const firstDuration = durations[0] ?? 100;
  const uniform = durations.every((d) => d === firstDuration);

  return createSpritesheetAnimationData({
    direction: tag.direction ?? 'forward',
    frameDuration: firstDuration,
    frameDurations: uniform ? null : durations,
    frameNames: tagFrameNames,
    loop: true,
    name: tag.name,
  });
}

function documentToData(doc: AsepriteDocument): SpritesheetData {
  // Region geometry is delegated to the atlas-formats parser (shared Aseprite document shape); this
  // package adds the per-frame durations and tag-based animations, which the atlas layer does not model.
  const regions = parseTextureAtlasAsepriteDocument(doc, createTextureAtlas()).regions;
  const frames: SpritesheetFrameData[] = regions.map(frameFromRegion);
  const frameNames: string[] = regions.map((region) => region.name ?? '');

  const durationMap = new Map<string, number>();
  if (Array.isArray(doc.frames)) {
    for (const entry of doc.frames as AsepriteArrayFrame[]) durationMap.set(entry.filename, entry.duration);
  } else {
    for (const [name, entry] of Object.entries(doc.frames)) durationMap.set(name, entry.duration);
  }

  const { meta } = doc;
  const animations =
    meta.frameTags && meta.frameTags.length > 0
      ? meta.frameTags.map((tag) => animationFromTag(tag, frameNames, durationMap))
      : [];

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

/** Parse an Aseprite JSON string directly to a SpritesheetData.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Use `parseAsepriteSpritesheetDocument` instead when you need round-trip serialisation.
 *
 *  Per-frame durations from Aseprite are preserved in `animation.frameDurations`
 *  when frames within a tag have varying durations. */
export function parseAsepriteSpritesheet(json: string): SpritesheetData {
  return documentToData(JSON.parse(json) as AsepriteDocument);
}

/** Parse an Aseprite JSON string and preserve the full document for round-trip
 *  serialisation via `serializeAsepriteSpritesheet`. */
export function parseAsepriteSpritesheetDocument(json: string): AsepriteParsed {
  const document = JSON.parse(json) as AsepriteDocument;
  return { data: documentToData(document), document };
}
