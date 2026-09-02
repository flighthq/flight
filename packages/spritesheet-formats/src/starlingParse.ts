import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet/contract';
import { parseTextureAtlasStarlingXml } from '@flighthq/textureatlas-formats/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type {
  ImportDiagnostic,
  SpritesheetAnimationData,
  SpritesheetData,
  SpritesheetFrameData,
  StarlingDocument,
  StarlingParseOptions,
  StarlingParsed,
  StarlingSubTexture,
  TextureAtlasRegion,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

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
        name: base,
        repeatCount: -1,
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
  diagnostics: ImportDiagnostic[] | undefined,
): SpritesheetData {
  const frames = regions.map(frameFromRegion);
  const frameNames = frames.map((f) => f.name);
  const animations = inferAnimations(frameNames, frameDuration);

  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Recover,
    'spritesheet.starling.missing-dimensions',
    'documentToData',
  );

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

export function parseStarlingSpritesheet(
  xml: string,
  options?: StarlingParseOptions,
  diagnostics?: ImportDiagnostic[],
): SpritesheetData {
  return documentToData(parseStarlingXml(xml), regionsFromXml(xml), options?.frameDuration ?? 100, diagnostics);
}

export function parseStarlingSpritesheetDocument(
  xml: string,
  options?: StarlingParseOptions,
  diagnostics?: ImportDiagnostic[],
): StarlingParsed {
  const document = parseStarlingXml(xml);
  return { data: documentToData(document, regionsFromXml(xml), options?.frameDuration ?? 100, diagnostics), document };
}
