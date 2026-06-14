import type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet';

import type { StarlingDocument, StarlingSubTexture } from './schema';

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

function subTextureToFrame(st: StarlingSubTexture): SpritesheetFrameData {
  const offsetX = st.frameX !== undefined ? -st.frameX : 0;
  const offsetY = st.frameY !== undefined ? -st.frameY : 0;
  const sourceWidth = st.frameWidth ?? st.width;
  const sourceHeight = st.frameHeight ?? st.height;

  const pivotX = st.pivotX !== undefined && sourceWidth > 0 ? st.pivotX / sourceWidth : null;
  const pivotY = st.pivotY !== undefined && sourceHeight > 0 ? st.pivotY / sourceHeight : null;

  return createSpritesheetFrameData({
    height: st.height,
    name: st.name,
    offsetX,
    offsetY,
    pivotX,
    pivotY,
    rotated: st.rotated ?? false,
    sourceHeight,
    sourceWidth,
    width: st.width,
    x: st.x,
    y: st.y,
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

function documentToData(doc: StarlingDocument, frameDuration: number): SpritesheetData {
  const frames = doc.subTextures.map(subTextureToFrame);
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

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a Starling / Sparrow XML atlas string directly to a SpritesheetData.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Animations are inferred from the standard `baseName_NNN` frame-naming convention.
 *  Use `parseStarlingDocument` instead when you need round-trip serialisation. */
export function parseStarling(xml: string, options?: StarlingParseOptions): SpritesheetData {
  return documentToData(parseStarlingXml(xml), options?.frameDuration ?? 100);
}

/** Parse a Starling / Sparrow XML atlas string and preserve the full document
 *  for round-trip serialisation via `serializeStarling`. */
export function parseStarlingDocument(xml: string, options?: StarlingParseOptions): StarlingParsed {
  const document = parseStarlingXml(xml);
  return { data: documentToData(document, options?.frameDuration ?? 100), document };
}
