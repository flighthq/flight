import type { SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet';
import { createSpritesheetData, createSpritesheetFrameData } from '@flighthq/spritesheet';
import type { XmlElement } from '@flighthq/xml';
import { parseXmlDocument } from '@flighthq/xml';

import type { CocosPlistDocument, CocosPlistFrame, CocosPlistMetadata } from './cocosPlistSchema';

export interface CocosPlistParsed {
  data: SpritesheetData;
  document: CocosPlistDocument;
}

// ─── plist structural helpers ─────────────────────────────────────────────────

/** Parse a Cocos plist size/offset string of the form "{w,h}" or "{x,y}". */
function parsePlistPair(s: string): [number, number] {
  const m = s.match(/{?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*}?/);
  return [parseFloat(m?.[1] ?? '0'), parseFloat(m?.[2] ?? '0')];
}

/** Parse a Cocos plist rect string of the form "{{x,y},{w,h}}". */
function parsePlistRect(s: string): { x: number; y: number; w: number; h: number } {
  const m = s.match(/\{\s*\{\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\}\s*,\s*\{\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\}\s*\}/);
  return {
    h: parseFloat(m?.[4] ?? '0'),
    w: parseFloat(m?.[3] ?? '0'),
    x: parseFloat(m?.[1] ?? '0'),
    y: parseFloat(m?.[2] ?? '0'),
  };
}

/** Walk a plist <dict> element and return a key→value map, values still as XmlElement. */
function dictToMap(el: XmlElement): Map<string, XmlElement> {
  const map = new Map<string, XmlElement>();
  const children = el.children;
  for (let i = 0; i < children.length; i += 2) {
    const keyEl = children[i];
    const valEl = children[i + 1];
    if (keyEl?.name === 'key' && valEl) {
      map.set(keyEl.text, valEl);
    }
  }
  return map;
}

function getTextValue(el: XmlElement | undefined): string {
  return el?.text ?? '';
}

function getBoolValue(el: XmlElement | undefined): boolean {
  return el?.name === 'true';
}

function getIntValue(el: XmlElement | undefined): number {
  return parseInt(el?.text ?? '0', 10);
}

// ─── Internal parser ─────────────────────────────────────────────────────────

function parseCocosPlistXml(xml: string): CocosPlistDocument {
  const root = parseXmlDocument(xml);

  // Locate the root <dict> (may be under <plist>)
  let rootDict: XmlElement | null = null;
  if (root?.name === 'plist') {
    rootDict = root.children.find((c) => c.name === 'dict') ?? null;
  } else if (root?.name === 'dict') {
    rootDict = root;
  }

  if (!rootDict) return { frames: {}, metadata: { format: 0, size: '{0,0}', textureFileName: '' } };

  const rootMap = dictToMap(rootDict);

  // Parse metadata
  const metaEl = rootMap.get('metadata');
  let metadata: CocosPlistMetadata = { format: 0, size: '{0,0}', textureFileName: '' };
  if (metaEl?.name === 'dict') {
    const metaMap = dictToMap(metaEl);
    metadata = {
      format: getIntValue(metaMap.get('format')),
      size: getTextValue(metaMap.get('size')),
      textureFileName: getTextValue(metaMap.get('textureFileName')) || getTextValue(metaMap.get('realTextureFileName')),
    };
  }

  // Parse frames
  const framesEl = rootMap.get('frames');
  const frames: Record<string, CocosPlistFrame> = {};

  if (framesEl?.name === 'dict') {
    const framesMap = dictToMap(framesEl);
    for (const [frameName, frameEl] of framesMap) {
      if (frameEl.name !== 'dict') continue;
      const fm = dictToMap(frameEl);

      // Detect format version from available keys
      const hasSpriteFields = fm.has('spriteOffset');
      const hasFrame = fm.has('frame') || fm.has('textureRect');

      if (!hasFrame && !hasSpriteFields) continue;

      // Support both old-style (frame) and new-style (textureRect) keys
      const rectStr = getTextValue(fm.get('frame') ?? fm.get('textureRect'));
      const rotated = getBoolValue(fm.get('textureRotated') ?? fm.get('rotated'));
      const offsetStr = getTextValue(fm.get('spriteOffset') ?? fm.get('offset'));
      const sourceSizeStr = getTextValue(fm.get('spriteSourceSize') ?? fm.get('sourceSize'));
      const sizeStr = getTextValue(fm.get('spriteSize') ?? fm.get('size'));
      const trimmed = getBoolValue(fm.get('spriteTrimmed') ?? fm.get('trimmed'));

      const aliasEl = fm.get('aliases');
      const aliases: string[] = [];
      if (aliasEl?.name === 'array') {
        for (const child of aliasEl.children) {
          if (child.name === 'string') aliases.push(child.text);
        }
      }

      frames[frameName] = {
        aliases: aliases.length > 0 ? aliases : undefined,
        frame: rectStr,
        spriteOffset: offsetStr,
        spriteSize: sizeStr,
        spriteSourceSize: sourceSizeStr,
        spriteTrimmed: trimmed,
        textureRotated: rotated,
      };
    }
  }

  return { frames, metadata };
}

// ─── Internal conversion ─────────────────────────────────────────────────────

function plistFrameToData(name: string, pf: CocosPlistFrame): SpritesheetFrameData {
  const rect = parsePlistRect(pf.frame);
  const [offsetX, offsetY] = parsePlistPair(pf.spriteOffset);
  const [sourceWidth, sourceHeight] = parsePlistPair(pf.spriteSourceSize);

  // Rotated frames in plist have swapped w/h in the atlas rect
  const atlasWidth = pf.textureRotated ? rect.h : rect.w;
  const atlasHeight = pf.textureRotated ? rect.w : rect.h;

  return createSpritesheetFrameData({
    height: atlasHeight,
    name,
    offsetX,
    offsetY,
    pivotX: null,
    pivotY: null,
    rotated: pf.textureRotated,
    sourceHeight: sourceHeight > 0 ? sourceHeight : atlasHeight,
    sourceWidth: sourceWidth > 0 ? sourceWidth : atlasWidth,
    width: atlasWidth,
    x: rect.x,
    y: rect.y,
  });
}

function documentToData(doc: CocosPlistDocument): SpritesheetData {
  const frames = Object.entries(doc.frames).map(([name, pf]) => plistFrameToData(name, pf));
  const [imageWidth, imageHeight] = parsePlistPair(doc.metadata.size);

  return createSpritesheetData({
    animations: [],
    frames,
    imageFile: doc.metadata.textureFileName,
    imageHeight,
    imageWidth,
    scale: 1,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a Cocos Creator / Cocos2d-x plist XML atlas string directly to a SpritesheetData.
 *
 *  Single-pass: no intermediate document object is allocated.
 *  Use `parseCocosPlistSpritesheetDocument` instead when you need round-trip serialisation. */
export function parseCocosPlistSpritesheet(xml: string): SpritesheetData {
  return documentToData(parseCocosPlistXml(xml));
}

/** Parse a Cocos Creator / Cocos2d-x plist XML atlas string and preserve the full document
 *  for round-trip serialisation via `serializeCocosPlistSpritesheet`. */
export function parseCocosPlistSpritesheetDocument(xml: string): CocosPlistParsed {
  const document = parseCocosPlistXml(xml);
  return { data: documentToData(document), document };
}
