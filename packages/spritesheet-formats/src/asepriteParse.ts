import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet/contract';
import { parseTextureAtlasAsepriteDocument } from '@flighthq/textureatlas-formats/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type {
  AsepriteArrayFrame,
  AsepriteDocument,
  AsepriteFrameTag,
  AsepriteMeta,
  AsepriteParsed,
  ImportDiagnostic,
  SpritesheetAnimationData,
  SpritesheetData,
  SpritesheetFrameData,
  TextureAtlasRegion,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
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
    name: tag.name,
    repeatCount: -1,
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

export function parseAsepriteSpritesheet(json: string, diagnostics?: ImportDiagnostic[]): SpritesheetData {
  let document: AsepriteDocument;
  try {
    document = JSON.parse(json) as AsepriteDocument;
  } catch {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spritesheet.aseprite.malformed-json',
      'parseAsepriteSpritesheet',
    );
    return createSpritesheetData();
  }
  return documentToData(document);
}

export function parseAsepriteSpritesheetDocument(json: string, diagnostics?: ImportDiagnostic[]): AsepriteParsed {
  let document: AsepriteDocument;
  try {
    document = JSON.parse(json) as AsepriteDocument;
  } catch {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spritesheet.aseprite.malformed-json',
      'parseAsepriteSpritesheetDocument',
    );
    return { data: createSpritesheetData(), document: createEmptyAsepriteDocument() };
  }
  return { data: documentToData(document), document };
}

// The frame-less Aseprite document used as the malformed-JSON sentinel — a valid array document so the
// result round-trips through serializeAsepriteSpritesheet.
function createEmptyAsepriteDocument(): AsepriteDocument {
  const meta: AsepriteMeta = {
    app: '',
    format: '',
    frameTags: [],
    image: '',
    scale: 1,
    size: { h: 0, w: 0 },
    version: '',
  };
  return { frames: [], meta };
}
