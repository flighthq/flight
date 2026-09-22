// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const resolveDir = getFileUrlDirectory(import.meta.url);

async function bundleExport(name: string, lane: 'contract' | 'index' = 'contract'): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    minify: true,
    packages: 'external',
    stdin: {
      contents: `export { ${name} } from './${lane}.ts';`,
      resolveDir,
      sourcefile: `tree-shake-${name}.ts`,
    },
    treeShaking: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

const FAMILY_MARKERS: [family: string, included: string, excluded: string][] = [
  ['swfBitmapTagFamily', 'swf.jpeg-tables-missing', 'swf.shape-body-unreadable'],
  ['swfControlTagFamily', 'swf.scene-names', 'swf.font-glyph-table'],
  ['swfFontTagFamily', 'swf.font-glyph-table', 'swf.scene-names'],
  ['swfPlacementTagFamily', 'swf.blend-mode-behind-unread-filters', 'swf.font-glyph-table'],
  ['swfScriptTagFamily', 'swf.script.do-abc', 'swf.font-glyph-table'],
  ['swfShapeTagFamily', 'swf.shape-body-unreadable', 'swf.jpeg-tables-missing'],
  ['swfSoundTagFamily', 'swf.stream-sound-format', 'swf.font-glyph-table'],
  ['swfSpriteTagFamily', 'swf.tag-handler-unregistered', 'swf.font-glyph-table'],
  ['swfTextTagFamily', 'swf.text-shape-uncomposable', 'swf.font-glyph-table'],
  ['swfVideoTagFamily', 'videoTextures', 'swf.font-glyph-table'],
];

const ALL_FAMILY_MARKERS = [
  'swf.jpeg-tables-missing',
  'swf.scene-names',
  'swf.font-glyph-table',
  'swf.blend-mode-behind-unread-filters',
  'swf.script.do-abc',
  'swf.shape-body-unreadable',
  'swf.stream-sound-format',
  'swf.tag-handler-unregistered',
  'swf.text-shape-uncomposable',
  'videoTextures',
];

describe('SWF tag family tree shaking', () => {
  it.each(FAMILY_MARKERS)('keeps %s independently bundleable', async (name, included, excluded) => {
    const output = await bundleExport(name);

    expect(output).toContain(included);
    expect(output).not.toContain(excluded);
  });

  it.each(FAMILY_MARKERS)('keeps %s isolated from every other family marker', async (name, included, _excluded) => {
    const output = await bundleExport(name);

    for (const marker of ALL_FAMILY_MARKERS) {
      if (marker === included) continue;
      expect(output).not.toContain(marker);
    }
  });
});

function getFileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
