import type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet';
import {
  createSpritesheetAnimationData,
  createSpritesheetData,
  createSpritesheetFrameData,
} from '@flighthq/spritesheet';
import { createTextureAtlas } from '@flighthq/textureatlas';
import { parseTextureAtlasLibgdxAtlas } from '@flighthq/textureatlas-formats';
import type { LibgdxAtlasParseOptions, TextureAtlasRegion } from '@flighthq/types';

// ─── Internal types ───────────────────────────────────────────────────────────

interface LibgdxPage {
  filename: string;
  height: number;
  width: number;
}

interface LibgdxRegion {
  index: number;
  name: string;
  offsetX: number;
  offsetY: number;
  page: LibgdxPage;
  rotated: boolean;
  sourceHeight: number;
  sourceWidth: number;
  spriteHeight: number;
  spriteWidth: number;
  x: number;
  y: number;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseIntPair(value: string): [number, number] {
  const parts = value.split(',');
  return [parseInt(parts[0] ?? '0', 10), parseInt(parts[1] ?? '0', 10)];
}

function isFilename(line: string): boolean {
  return /[./]/.test(line) || /^\w+\.\w+$/.test(line);
}

function parseLibgdxAtlas(text: string): { pages: LibgdxPage[]; regions: LibgdxRegion[] } {
  const lines = text.split(/\r?\n/);
  const pages: LibgdxPage[] = [];
  const regions: LibgdxRegion[] = [];

  let currentPage: LibgdxPage | null = null;
  let currentRegion: LibgdxRegion | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      // Blank line: commit any in-progress region; next unindented non-empty line is a page filename
      if (currentRegion !== null) {
        regions.push(currentRegion);
        currentRegion = null;
      }
      continue;
    }

    const isIndented = raw[0] === ' ' || raw[0] === '\t';

    if (isIndented) {
      // Key: value line belonging to current page header or current region
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (currentRegion !== null) {
        // Region attribute
        switch (key) {
          case 'rotate':
            currentRegion.rotated = value === 'true';
            break;
          case 'xy': {
            const [x, y] = parseIntPair(value);
            currentRegion.x = x;
            currentRegion.y = y;
            break;
          }
          case 'size': {
            const [w, h] = parseIntPair(value);
            currentRegion.spriteWidth = w;
            currentRegion.spriteHeight = h;
            break;
          }
          case 'orig': {
            const [sw, sh] = parseIntPair(value);
            currentRegion.sourceWidth = sw;
            currentRegion.sourceHeight = sh;
            break;
          }
          case 'offset': {
            const [ox, oy] = parseIntPair(value);
            currentRegion.offsetX = ox;
            currentRegion.offsetY = oy;
            break;
          }
          case 'index':
            currentRegion.index = parseInt(value, 10);
            break;
        }
      } else if (currentPage !== null) {
        // Page header attribute
        switch (key) {
          case 'size': {
            const [w, h] = parseIntPair(value);
            currentPage.width = w;
            currentPage.height = h;
            break;
          }
        }
      }
    } else {
      // Unindented non-empty line: either a page filename or a region name
      if (currentRegion !== null) {
        regions.push(currentRegion);
        currentRegion = null;
      }

      if (isFilename(trimmed) && currentPage === null) {
        // First unindented non-kv line after a blank (or at start) is a page filename
        currentPage = { filename: trimmed, height: 0, width: 0 };
        pages.push(currentPage);
      } else if (isFilename(trimmed) && currentPage !== null && trimmed !== currentPage.filename) {
        // Another page filename (multi-page atlas)
        currentPage = { filename: trimmed, height: 0, width: 0 };
        pages.push(currentPage);
      } else {
        // Region name
        if (currentPage === null) {
          // Malformed: no page seen yet; create a stub page
          currentPage = { filename: '', height: 0, width: 0 };
          pages.push(currentPage);
        }
        currentRegion = {
          index: -1,
          name: trimmed,
          offsetX: 0,
          offsetY: 0,
          page: currentPage,
          rotated: false,
          sourceHeight: 0,
          sourceWidth: 0,
          spriteHeight: 0,
          spriteWidth: 0,
          x: 0,
          y: 0,
        };
      }
    }
  }

  // Commit trailing region
  if (currentRegion !== null) {
    regions.push(currentRegion);
  }

  return { pages, regions };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Maps an atlas region (geometry owned by @flighthq/textureatlas-formats — incl. libGDX rotate/orig/
// offset handling and the `name_index` disambiguation for indexed regions) to a spritesheet frame.
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

// ─── Public API ───────────────────────────────────────────────────────────────

/** Parse a LibGDX `.atlas` text string directly to a `SpritesheetData`.
 *
 *  Single-pass line-by-line parser. Handles single-page and multi-page atlases.
 *  `rotate: true` regions are marked as `rotated` (90° clockwise in the atlas).
 *  Animations are inferred from the standard `baseName_NNN` frame-naming convention;
 *  indexed regions (`index >= 0`) are also grouped into animations. */
export function parseLibgdxAtlasSpritesheet(text: string, options?: LibgdxAtlasParseOptions): SpritesheetData {
  const frameDuration = options?.frameDuration ?? 100;
  // Page metadata (image file + size) is libGDX-specific and not modeled by TextureAtlas, so it is read
  // from the local page parse; the region geometry is delegated to the atlas-formats parser.
  const { pages } = parseLibgdxAtlas(text);

  // Use the first page for top-level image metadata
  const firstPage = pages[0];
  const imageFile = firstPage?.filename ?? '';
  const imageWidth = firstPage?.width ?? 0;
  const imageHeight = firstPage?.height ?? 0;

  const regions: readonly TextureAtlasRegion[] = parseTextureAtlasLibgdxAtlas(text, createTextureAtlas()).regions;
  const frames: SpritesheetFrameData[] = regions.map(frameFromRegion);
  const frameNames = frames.map((f) => f.name);
  const animations = inferAnimations(frameNames, frameDuration);

  return createSpritesheetData({
    animations,
    frames,
    imageFile,
    imageHeight,
    imageWidth,
    scale: 1,
  });
}
