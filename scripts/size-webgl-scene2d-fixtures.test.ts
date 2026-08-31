import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { collectSizeCases, getSizeCaseKey } from './size-runner';

const root = resolve(import.meta.dirname, '..');
const fixturesDirectory = resolve(root, 'tools', 'size', 'fixtures');

const profiles = [
  {
    constructors: ['createDisplayObject', 'createBitmapText'],
    imports: [
      '@flighthq/bitmapfont',
      '@flighthq/bitmaptext',
      '@flighthq/host-web',
      '@flighthq/image',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/texture',
      '@flighthq/textureatlas',
      '@flighthq/types',
    ],
    kind: 'BitmapTextKind',
    name: 'scene2d-gl-pipeline-bitmaptext',
    registrations: ['registerGlImageTextureResolver', 'registerGlStandardMaterial', 'registerRenderer'],
    renderer: 'defaultGlBitmapTextRenderer',
  },
  {
    constructors: ['createDisplayObject'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/types',
    ],
    kind: 'DisplayObjectKind',
    name: 'scene2d-gl-pipeline-displayobject',
    registrations: ['registerRenderer'],
    renderer: 'defaultGlScene2DRenderer',
    sizeOnly: true,
  },
  {
    constructors: ['createDisplayObject', 'createMorphShape'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/path',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/shape',
      '@flighthq/types',
    ],
    kind: 'MorphShapeKind',
    name: 'scene2d-gl-pipeline-morphshape',
    registrations: ['registerRenderer'],
    renderer: 'defaultGlMorphShapeRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createParticleEmitter2D'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/image',
      '@flighthq/node',
      '@flighthq/particleemitter',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/texture',
      '@flighthq/textureatlas',
      '@flighthq/types',
    ],
    kind: 'ParticleEmitter2DKind',
    name: 'scene2d-gl-pipeline-particleemitter2d',
    registrations: ['registerGlImageTextureResolver', 'registerRenderer'],
    renderer: 'defaultGlParticleEmitter2DRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createRichText'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/text',
      '@flighthq/types',
    ],
    kind: 'RichTextKind',
    name: 'scene2d-gl-pipeline-richtext',
    registrations: ['registerRenderer'],
    renderer: 'defaultGlRichTextRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createScale9Shape'],
    imports: [
      '@flighthq/geometry',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-canvas',
      '@flighthq/scene2d-gl',
      '@flighthq/shape',
      '@flighthq/types',
    ],
    kind: 'Scale9ShapeKind',
    name: 'scene2d-gl-pipeline-scale9shape',
    registrations: ['registerGlShapeCommands', 'registerGlShapeRasterizer', 'registerRenderer'],
    renderer: 'defaultGlScale9ShapeRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createTextLabel'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/text',
      '@flighthq/types',
    ],
    kind: 'TextLabelKind',
    name: 'scene2d-gl-pipeline-textlabel',
    registrations: ['registerGlStandardMaterial', 'registerRenderer'],
    renderer: 'defaultGlTextLabelRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createTilemap'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/image',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/texture',
      '@flighthq/textureatlas',
      '@flighthq/tilemap',
      '@flighthq/types',
    ],
    kind: 'TilemapKind',
    name: 'scene2d-gl-pipeline-tilemap',
    registrations: ['registerGlImageTextureResolver', 'registerGlStandardMaterial', 'registerRenderer'],
    renderer: 'defaultGlTilemapRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createSprite'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/image',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/texture',
      '@flighthq/types',
    ],
    kind: 'SpriteKind',
    name: 'scene2d-gl-pipeline-sprite',
    registrations: ['registerGlImageTextureResolver', 'registerGlStandardMaterial', 'registerRenderer'],
    renderer: 'defaultGlSpriteRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createShape'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/shape',
      '@flighthq/types',
    ],
    kind: 'ShapeKind',
    name: 'scene2d-gl-pipeline-shape',
    registrations: ['registerRenderer'],
    renderer: 'defaultGlMeshShapeRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createQuadBatch'],
    imports: [
      '@flighthq/host-web',
      '@flighthq/image',
      '@flighthq/node',
      '@flighthq/quadbatch',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/texture',
      '@flighthq/textureatlas',
      '@flighthq/types',
    ],
    kind: 'QuadBatchKind',
    name: 'scene2d-gl-pipeline-quadbatch',
    registrations: ['registerGlImageTextureResolver', 'registerGlStandardMaterial', 'registerRenderer'],
    renderer: 'defaultGlQuadBatchRenderer',
  },
] as const;

describe('WebGL Scene2D size fixtures', () => {
  it('discovers one WebGL size case per isolated feature', () => {
    const keys = collectSizeCases(fixturesDirectory)
      .map(getSizeCaseKey)
      .filter((key) => profiles.some((profile) => key === `${profile.name}:webgl`));

    expect(keys).toEqual(profiles.map((profile) => `${profile.name}:webgl`).sort());
  });

  for (const profile of profiles) {
    describe(profile.name, () => {
      const directory = resolve(fixturesDirectory, profile.name);

      it('declares captureability honestly', () => {
        const packageJson = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
        expect(packageJson.flightSize).toEqual({
          ...(profile.sizeOnly === true ? { kind: 'size-only-control' } : {}),
          name: profile.name,
        });

        const captureManifestPath = resolve(directory, 'tool-capture.json');
        if (profile.sizeOnly === true) {
          expect(existsSync(captureManifestPath)).toBe(false);
          return;
        }

        const manifest = JSON.parse(readFileSync(captureManifestPath, 'utf8'));
        expect(manifest).toEqual({
          subject: `${profile.name}-size-fixture`,
          entries: [{ name: profile.name, renderers: ['webgl'], routes: { webgl: '/' } }],
        });
      });

      it('keeps the Host, renderer, and registrars feature-tight', () => {
        const source = readFileSync(resolve(directory, 'src', 'render.webgl.ts'), 'utf8');
        const imports = [...source.matchAll(/from '(@flighthq\/[^']+)'/g)].map((match) => match[1]).sort();
        const constructors = [
          ...source.matchAll(
            /\b(create(?:BitmapText|DisplayObject|MorphShape|ParticleEmitter2D|QuadBatch|RichText|Scale9Shape|Shape|Sprite|TextLabel|Tilemap))\s*\(/g,
          ),
        ].map((match) => match[1]);
        const kinds = [...new Set([...source.matchAll(/\b[A-Z]\w+Kind\b/g)].map((match) => match[0]))];
        const registrations = [...source.matchAll(/\b(register[A-Z]\w*)\s*\(/g)].map((match) => match[1]).sort();
        const renderers = [...new Set([...source.matchAll(/\bdefaultGl\w+Renderer\b/g)].map((match) => match[0]))];

        expect(imports).toEqual([...profile.imports].sort());
        expect(constructors).toEqual(profile.constructors);
        expect(kinds).toEqual([profile.kind]);
        expect(registrations).toEqual([...profile.registrations].sort());
        expect(renderers).toEqual([profile.renderer]);
        expect(source.match(/withRegistryTableEntry\s*\(/g)).toHaveLength(1);
        expect(source).toContain('createWebGlRenderSurfaceProvider');
        expect(source).not.toMatch(/\b(?:enableHostWebGlRenderSurface|scene2dGlPipeline|webHost)\b/);
      });

      it('threads the feature through the complete rendering call chain', () => {
        const source = readFileSync(resolve(directory, 'src', 'render.webgl.ts'), 'utf8');
        for (const call of [
          'createGlContextFromCanvasElement',
          'createGlContextState',
          'createGlPipeline',
          'createGlRenderState',
          'prepareScene2DRender',
          'renderGlBackground',
          'renderGlScene2D',
        ]) {
          expect(source).toContain(`${call}(`);
        }
        expect(source.lastIndexOf('Reflect.set(')).toBeGreaterThan(source.lastIndexOf('renderGlScene2D(state, root)'));
      });
    });
  }
});
