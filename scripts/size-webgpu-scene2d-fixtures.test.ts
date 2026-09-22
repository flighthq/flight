import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectSizeCases, getSizeCaseKey } from './size-runner';

const root = resolve(import.meta.dirname, '..');
const fixturesDirectory = resolve(root, 'tools', 'size', 'fixtures');
const prefix = 'scene2d-wgpu-pipeline-';

const profiles = [
  ['bitmaptext', 'BitmapTextKind', 'wgpuBitmapTextRenderer'],
  ['displayobject', null, null],
  ['morphshape', 'MorphShapeKind', 'wgpuMorphShapeRenderer'],
  ['particleemitter2d', 'ParticleEmitter2DKind', 'wgpuParticleEmitter2DRenderer'],
  ['quadbatch', 'QuadBatchKind', 'wgpuQuadBatchRenderer'],
  ['richtext', 'RichTextKind', 'wgpuRichTextRenderer'],
  ['scale9shape', 'Scale9ShapeKind', 'wgpuScale9ShapeRenderer'],
  ['shape', 'ShapeKind', 'wgpuShapeRenderer'],
  ['textlabel', 'TextLabelKind', 'wgpuTextLabelRenderer'],
  ['tilemap', 'TilemapKind', 'wgpuTilemapRenderer'],
] as const;

describe('WebGPU Scene2D second-wave size fixtures', () => {
  it('discovers exactly one WebGPU case for every requested kind', () => {
    const expected = profiles.map(([slug]) => `${prefix}${slug}:webgpu`).sort();
    const actual = collectSizeCases(fixturesDirectory)
      .map(getSizeCaseKey)
      .filter((key) => expected.includes(key))
      .sort();
    expect(actual).toEqual(expected);
  });

  for (const [slug, kind, renderer] of profiles) {
    const name = `${prefix}${slug}`;
    const directory = resolve(fixturesDirectory, name);

    describe(name, () => {
      it('uses only the leaf WebGPU pipeline and host surface', () => {
        const source = readFileSync(resolve(directory, 'src', 'render.webgpu.ts'), 'utf8');
        expect(source).toContain('createWgpuSurface(webHostWgpuContext,');
        expect(source).toContain('createWgpuScreenRenderTarget(');
        expect(source).toContain('createWgpuRenderState(');
        expect(source).toContain('prepareScene2DRender(');
        expect(source).toContain('beginWgpuRenderPass(');
        expect(source).toContain('renderWgpuScene2D(');
        expect(source).toContain('endWgpuRenderPass(');
        expect(source).not.toMatch(
          /\b(?:enableHostWeb|wgpuScene2DRenderPreset|registerStandardWgpuTextureResolvers|webHost)\b/,
        );
        expect(source).not.toContain('@flighthq/sdk');
      });

      if (renderer === null) {
        it('declares the non-visible DisplayObject case as the lone renderer-free control', () => {
          const manifest = resolve(directory, 'tool-capture.json');
          const metadata = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
          const source = readFileSync(resolve(directory, 'src', 'render.webgpu.ts'), 'utf8');
          expect(metadata.flightSize).toEqual({ kind: 'size-only-control', name });
          expect(existsSync(manifest)).toBe(false);
          expect(source).not.toMatch(/\bwgpu\w+Renderer\b/);
          expect(source).not.toContain('withRegistryTableEntry(');
        });
      } else {
        it('binds exactly its one renderer and has a single-route capture', () => {
          const source = readFileSync(resolve(directory, 'src', 'render.webgpu.ts'), 'utf8');
          const renderers = [...new Set([...source.matchAll(/\bwgpu\w+Renderer\b/g)].map((match) => match[0]))];
          const kinds = [...new Set([...source.matchAll(/\b[A-Z]\w+Kind\b/g)].map((match) => match[0]))].filter(
            (value) => value !== 'StandardMaterialKind',
          );
          const manifest = JSON.parse(readFileSync(resolve(directory, 'tool-capture.json'), 'utf8'));
          expect(renderers).toEqual([renderer]);
          expect(kinds).toEqual([kind]);
          expect(source.match(/nodeRenderers:\s*withRegistryTableEntry\s*\(/g)).toHaveLength(1);
          expect(manifest).toEqual({
            subject: `${name}-size-fixture`,
            entries: [{ name, renderers: ['webgpu'], routes: { webgpu: '/' } }],
          });
        });
      }
    });
  }

  it('limits the scale-9 Canvas bridge to the required rasterizer symbols', () => {
    const source = readFileSync(resolve(fixturesDirectory, `${prefix}scale9shape`, 'src', 'render.webgpu.ts'), 'utf8');
    const bridge = /import\s*\{([^}]*)\}\s*from '@flighthq\/scene2d-canvas';/su.exec(source)?.[1] ?? '';
    expect(
      bridge
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .sort(),
    ).toEqual([
      'canvasShapeCommands',
      'createCanvasShapeRasterizer',
      'createCanvasTextureResolvers',
      'registerCanvasShapeCommands',
    ]);
  });
});
