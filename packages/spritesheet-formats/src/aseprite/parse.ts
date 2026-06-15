import type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet';

import type { AsepriteArrayFrame, AsepriteBaseFrame, AsepriteDocument, AsepriteFrameTag, AsepriteMeta } from './schema';

export interface AsepriteParsed {
  data: SpritesheetData;
  document: AsepriteDocument;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function frameFromEntry(name: string, entry: AsepriteBaseFrame): SpritesheetFrameData {
  return createSpritesheetFrameData({
    height: entry.frame.h,
    name,
    offsetX: entry.spriteSourceSize.x,
    offsetY: entry.spriteSourceSize.y,
    pivotX: null,
    pivotY: null,
    rotated: entry.rotated,
    sourceHeight: entry.sourceSize.h,
    sourceWidth: entry.sourceSize.w,
    width: entry.frame.w,
    x: entry.frame.x,
    y: entry.frame.y,
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
  const frames: SpritesheetFrameData[] = [];
  const frameNames: string[] = [];
  const durationMap = new Map<string, number>();

  if (Array.isArray(doc.frames)) {
    for (const entry of doc.frames as AsepriteArrayFrame[]) {
      frames.push(frameFromEntry(entry.filename, entry));
      frameNames.push(entry.filename);
      durationMap.set(entry.filename, entry.duration);
    }
  } else {
    for (const [name, entry] of Object.entries(doc.frames)) {
      frames.push(frameFromEntry(name, entry));
      frameNames.push(name);
      durationMap.set(name, entry.duration);
    }
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
