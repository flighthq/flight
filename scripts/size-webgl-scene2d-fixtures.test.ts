import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { collectSizeCases, getSizeCaseKey } from './size-runner';

const root = resolve(import.meta.dirname, '..');
const fixturesDirectory = resolve(root, 'tools', 'size', 'fixtures');

const profiles = [
  {
    constructors: ['createDisplayObject', 'createBitmapText'],
    imports: [
      '@flighthq/app',
      '@flighthq/bitmapfont',
      '@flighthq/bitmaptext',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/texture',
      '@flighthq/textureatlas',
      '@flighthq/types',
    ],
    kind: 'BitmapTextKind',
    name: 'scene2d-gl-pipeline-bitmaptext',
    registrations: ['registerGlImageTextureResolver', 'registerGlStandardMaterial', 'registerNodeRenderer'],
    renderer: 'glBitmapTextRenderer',
  },
  {
    constructors: ['createDisplayObject'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/types',
    ],
    kind: 'DisplayObjectKind',
    name: 'scene2d-gl-pipeline-displayobject',
    registrations: ['registerNodeRenderer'],
    renderer: 'glScene2DRenderer',
    sizeOnly: true,
  },
  {
    constructors: ['createDisplayObject', 'createMorphShape'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/path',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/shape',
      '@flighthq/types',
    ],
    kind: 'MorphShapeKind',
    name: 'scene2d-gl-pipeline-morphshape',
    registrations: ['registerNodeRenderer'],
    renderer: 'glMorphShapeRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createParticleEmitter2D'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/particleemitter',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/texture',
      '@flighthq/textureatlas',
      '@flighthq/types',
    ],
    kind: 'ParticleEmitter2DKind',
    name: 'scene2d-gl-pipeline-particleemitter2d',
    registrations: ['registerGlImageTextureResolver', 'registerNodeRenderer'],
    renderer: 'glParticleEmitter2DRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createRichText'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/text',
      '@flighthq/types',
    ],
    kind: 'RichTextKind',
    name: 'scene2d-gl-pipeline-richtext',
    registrations: ['registerNodeRenderer'],
    renderer: 'glRichTextRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createScale9Shape'],
    imports: [
      '@flighthq/app',
      '@flighthq/geometry',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-canvas',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/shape',
      '@flighthq/types',
    ],
    kind: 'Scale9ShapeKind',
    name: 'scene2d-gl-pipeline-scale9shape',
    // The CANVAS shape commands in a WebGL profile are correct, not a copy-paste slip: shape COMMANDS
    // are the backend-independent geometry vocabulary and only `registerCanvasShapeCommand(s)` exists
    // for them, while the GL side contributes the RASTERIZER that draws what they describe. The
    // retired `registerGlShapeCommands` is what this list used to name, and the fixture had already
    // moved on — the profile had not, so the assertion failed against a fixture that was right.
    registrations: ['registerCanvasShapeCommands', 'registerGlShapeRasterizer', 'registerNodeRenderer'],
    renderer: 'glScale9ShapeRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createTextLabel'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/text',
      '@flighthq/types',
    ],
    kind: 'TextLabelKind',
    name: 'scene2d-gl-pipeline-textlabel',
    registrations: ['registerGlStandardMaterial', 'registerNodeRenderer'],
    renderer: 'glTextLabelRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createTilemap'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/texture',
      '@flighthq/textureatlas',
      '@flighthq/tilemap',
      '@flighthq/types',
    ],
    kind: 'TilemapKind',
    name: 'scene2d-gl-pipeline-tilemap',
    registrations: ['registerGlImageTextureResolver', 'registerGlStandardMaterial', 'registerNodeRenderer'],
    renderer: 'glTilemapRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createSprite'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/texture',
      '@flighthq/types',
    ],
    kind: 'SpriteKind',
    name: 'scene2d-gl-pipeline-sprite',
    registrations: ['registerGlImageTextureResolver', 'registerGlStandardMaterial', 'registerNodeRenderer'],
    renderer: 'glSpriteRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createShape'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/shape',
      '@flighthq/types',
    ],
    kind: 'ShapeKind',
    name: 'scene2d-gl-pipeline-shape',
    registrations: ['registerNodeRenderer'],
    renderer: 'glMeshShapeRenderer',
  },
  {
    constructors: ['createDisplayObject', 'createQuadBatch'],
    imports: [
      '@flighthq/app',
      '@flighthq/host-web',
      '@flighthq/node',
      '@flighthq/quadbatch',
      '@flighthq/registry',
      '@flighthq/render',
      '@flighthq/render-gl',
      '@flighthq/scene2d',
      '@flighthq/scene2d-gl',
      '@flighthq/surface',
      '@flighthq/texture',
      '@flighthq/textureatlas',
      '@flighthq/types',
    ],
    kind: 'QuadBatchKind',
    name: 'scene2d-gl-pipeline-quadbatch',
    registrations: ['registerGlImageTextureResolver', 'registerGlStandardMaterial', 'registerNodeRenderer'],
    renderer: 'glQuadBatchRenderer',
  },
] as const;

describe('WebGL Scene2D size fixtures', () => {
  it('discovers one WebGL size case per isolated feature and only marks DisplayObject as size-only', () => {
    const keys = collectSizeCases(fixturesDirectory)
      .map(getSizeCaseKey)
      .filter((key) => profiles.some((profile) => key === `${profile.name}:webgl`));
    const sizeOnlyNames = profiles
      .filter((profile) => 'sizeOnly' in profile && profile.sizeOnly === true)
      .map((profile) => profile.name);

    expect(keys).toEqual(profiles.map((profile) => `${profile.name}:webgl`).sort());
    expect(sizeOnlyNames).toEqual(['scene2d-gl-pipeline-displayobject']);
  });

  for (const profile of profiles) {
    describe(profile.name, () => {
      const directory = resolve(fixturesDirectory, profile.name);

      it('declares captureability honestly', () => {
        const packageJson = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
        const isSizeOnly = 'sizeOnly' in profile && profile.sizeOnly === true;
        expect(packageJson.flightSize).toEqual({
          ...(isSizeOnly ? { kind: 'size-only-control' } : {}),
          name: profile.name,
        });

        const captureManifestPath = resolve(directory, 'tool-capture.json');
        if (isSizeOnly) {
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
        const renderers = [...new Set([...source.matchAll(/\bgl\w+Renderer\b/g)].map((match) => match[0]))];

        expect(imports).toEqual([...profile.imports].sort());
        expect(constructors).toEqual(profile.constructors);
        expect(kinds).toEqual([profile.kind]);
        expect(registrations).toEqual([...profile.registrations].sort());
        expect(renderers).toEqual([profile.renderer]);
        expect(source.match(/withRegistryTableEntry\s*\(/g)).toHaveLength(1);
        expect(source).toContain('createGlSurface(webHostGl,');
        expect(source).not.toMatch(/\b(?:enableHostWebGlRenderSurface|glScene2DRenderPreset|webHost)\b/);
      });

      it('threads the feature through the complete rendering call chain', () => {
        const source = readFileSync(resolve(directory, 'src', 'render.webgl.ts'), 'utf8');
        for (const call of ['createGlSurface', 'createGlRenderState', 'prepareScene2DRender', 'renderGlScene2D']) {
          expect(source).toContain(`${call}(`);
        }
        expect(source.lastIndexOf('Reflect.set(')).toBeGreaterThan(source.lastIndexOf('renderGlScene2D(state, root)'));
      });
    });
  }
});
