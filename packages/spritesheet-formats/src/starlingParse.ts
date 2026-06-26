import type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet';
import { createTextureAtlas } from '@flighthq/textureatlas';
import { parseTextureAtlasStarlingXml } from '@flighthq/textureatlas-formats';
import type { TextureAtlasRegion } from '@flighthq/types';

import type { StarlingDocument, StarlingSubTexture } from './starlingSchema';

export interface StarlingParsed {
  data: SpritesheetData;
  document: StarlingDocument;
}

export interface StarlingParseOptions {
  /** Default duration (ms) per frame when building inferred animations. Defaults to 100. */
  frameDuration?: number;
}

// ─── Minimal XML attribute parser ────────────────────────────────────────────

function parseAttrs(attrs: string): Record<string, string> {
  const result: Record<string, string> = {};
  const RE = /(\w+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(attrs)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

function parseStarlingXml(xml: string): StarlingDocument {
  const atlasRE = /<TextureAtlas([^>]*)>/;
  const atlasMatch = atlasRE.exec(xml);
  const atlasAttrs = atlasMatch ? parseAttrs(atlasMatch[1]) : {};
  const imagePath = atlasAttrs['imagePath'] ?? '';

  const subTextures: StarlingSubTexture[] = [];
  const stRE = /<SubTexture([^/]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = stRE.exec(xml)) !== null) {
    const a = parseAttrs(m[1]);
    if (!a['name']) continue;
    const st: StarlingSubTexture = {
      height: parseFloat(a['height'] ?? '0'),
      name: a['name'],
      width: parseFloat(a['width'] ?? '0'),
      x: parseFloat(a['x'] ?? '0'),
      y: parseFloat(a['y'] ?? '0'),
    };
    if (a['frameX'] !== undefined) st.frameX = parseFloat(a['frameX']);
    if (a['frameY'] !== undefined) st.frameY = parseFloat(a['frameY']);
    if (a['frameWidth'] !== undefined) st.frameWidth = parseFloat(a['frameWidth']);
    if (a['frameHeight'] !== undefined) st.frameHeight = parseFloat(a['frameHeight']);
    if (a['pivotX'] !== undefined) st.pivotX = parseFloat(a['pivotX']);
    if (a['pivotY'] !== undefined) st.pivotY = parseFloat(a['pivotY']);
    if (a['rotated'] !== undefined) st.rotated = a['rotated'] === 'true';
    subTextures.push(st);
  }

  return { imagePath, subTextures };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

// Maps an atlas region (geometry owned by @flighthq/textureatlas-formats — incl. Starling's negated
// frameX/Y offsets and trim handling) to a spritesheet frame. Starling pivots are authored in source
// pixels; the spritesheet layer normalizes them to the 0..1 range, so re-divide the atlas's raw pivot
// by the source size here.
function frameFromRegion(region: Readonly<TextureAtlasRegion>): SpritesheetFrameData {
  const sourceWidth = region.originalWidth ?? region.width;
  const sourceHeight = region.originalHeight ?? region.height;
  return createSpritesheetFrameData({
    height: region.height,
    name: region.name ?? '',
    offsetX: region.sourceX,
    offsetY: region.sourceY,
    pivotX: region.pivotX !== null && sourceWidth > 0 ? region.pivotX / sourceWidth : null,
    pivotY: region.pivotY !== null && sourceHeight > 0 ? region.pivotY / sourceHeight : null,
    rotated: region.rotated,
    sourceHeight,
    sourceWidth,
    width: region.width,
    x: region.x,
    y: region.y,
  });
}

/** Infer animations from frame names using the `baseName_NNN` convention.
 *  Frames whose names do not end in a numeric suffix are left as standalone frames. */
function inferAnimations(frameNames: string[], frameDuration: number): SpritesheetAnimationData[] {
  const groups = new Map<string, Array<{ name: string; index: number }>>();

  for (const name of frameNames) {
    const noExt = name.replace(/\.\w+$/, '');
    const match = noExt.match(/^(.*?)_?(\d+)$/);
    if (!match) continue;
    const [, base, numStr] = match;
    const index = parseInt(numStr, 10);
    const bucket = groups.get(base);
    if (bucket) bucket.push({ index, name });
    else groups.set(base, [{ index, name }]);
  }

  const animations: SpritesheetAnimationData[] = [];
  for (const [base, entries] of groups) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => a.index - b.index);
    animations.push(
      createSpritesheetAnimationData({
        frameDuration,
        frameNames: entries.map((e) => e.name),
        loop: true,
        name: base,
      }),
    );
  }
  return animations;
}

// Region geometry is delegated to @flighthq/textureatlas-formats; this layer keeps the imagePath and
// the inferred `baseName_NNN` animations. `regions` come from the atlas parser over the same XML.
function documentToData(
  doc: StarlingDocument,
  regions: readonly TextureAtlasRegion[],
  frameDuration: number,
): SpritesheetData {
  const frames = regions.map(frameFromRegion);
  const frameNames = frames.map((f) => f.name);
  const animations = inferAnimations(frameNames, frameDuration);

  return createSpritesheetData({
    animations,
    frames,
    imageFile: doc.imagePath,
    imageHeight: 0,
    imageWidth: 0,
    scale: 1,
  });
}

function regionsFromXml(xml: string): readonly TextureAtlasRegion[] {
  return parseTextureAtlasStarlingXml(xml, createTextureAtlas()).regions;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a Starling / Sparrow XML atlas string directly to a SpritesheetData.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Animations are inferred from the standard `baseName_NNN` frame-naming convention.
 *  Use `parseStarlingSpritesheetDocument` instead when you need round-trip serialisation. */
export function parseStarlingSpritesheet(xml: string, options?: StarlingParseOptions): SpritesheetData {
  return documentToData(parseStarlingXml(xml), regionsFromXml(xml), options?.frameDuration ?? 100);
}

/** Parse a Starling / Sparrow XML atlas string and preserve the full document
 *  for round-trip serialisation via `serializeStarlingSpritesheet`. */
export function parseStarlingSpritesheetDocument(xml: string, options?: StarlingParseOptions): StarlingParsed {
  const document = parseStarlingXml(xml);
  return { data: documentToData(document, regionsFromXml(xml), options?.frameDuration ?? 100), document };
}
