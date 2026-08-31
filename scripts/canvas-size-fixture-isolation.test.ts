import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// The per-feature Canvas size fixtures. Each measures the container-only floor plus exactly ONE
// feature, so a marginal feature cost is (fixture − the size-only control). That subtraction is only
// meaningful while each fixture stays isolated, which is what this file guards.
const FEATURE_FIXTURES = [
  'scene2d-canvas-bitmaptext',
  'scene2d-canvas-morphshape',
  'scene2d-canvas-particleemitter2d',
  'scene2d-canvas-quadbatch',
  'scene2d-canvas-richtext',
  'scene2d-canvas-scale9shape',
  'scene2d-canvas-shape',
  'scene2d-canvas-text',
  'scene2d-canvas-tilemap',
  'scene2d-canvas-transform',
] as const;

// The renderer each drawing fixture is allowed to bind. The size-only control binds none, but that is
// NOT listed here — it is derived from its declared kind, so the manifest stays the single source.
const ALLOWED_RENDERER: Record<string, readonly string[]> = {
  'scene2d-canvas-bitmaptext': ['defaultCanvasBitmapTextRenderer'],
  'scene2d-canvas-morphshape': ['defaultCanvasMorphShapeRenderer'],
  'scene2d-canvas-particleemitter2d': ['defaultCanvasParticleEmitter2DRenderer'],
  'scene2d-canvas-quadbatch': ['defaultCanvasQuadBatchRenderer'],
  'scene2d-canvas-richtext': ['defaultCanvasRichTextRenderer'],
  'scene2d-canvas-scale9shape': ['defaultCanvasScale9ShapeRenderer'],
  'scene2d-canvas-shape': ['defaultCanvasShapeRenderer'],
  'scene2d-canvas-text': ['defaultCanvasTextLabelRenderer'],
  'scene2d-canvas-tilemap': ['defaultCanvasTilemapRenderer'],
};

// Exactly the fixtures whose feature samples a texture, and which therefore register the one image
// texture resolver. Listing the permitted set both ways round is deliberate: a vector fixture that
// grows a resolver is measuring texture upload it does not use, and a texture fixture that LOSES its
// resolver silently draws nothing while still reporting a plausible size — the more dangerous of the
// two, because the number stays believable.
const TEXTURE_FIXTURES = [
  'scene2d-canvas-bitmaptext',
  'scene2d-canvas-particleemitter2d',
  'scene2d-canvas-quadbatch',
  'scene2d-canvas-tilemap',
] as const;

// Aggregates whose whole purpose is to bind everything at once. A per-feature fixture that reaches one
// stops measuring its feature and starts measuring the aggregate.
const AGGREGATES = ['scene2dCanvasPipeline', 'canvasShapeCommandTable', 'enableHostWeb'] as const;

// ★ THE ROLE IS DECLARED IN PACKAGE METADATA, NOT IN A LIST HERE. `flightSize.kind` is what makes a
// fixture the control: it draws nothing, carries no capture manifest, and is the subtrahend the other
// fixtures are measured against. Deriving every rule below from that field means a future size-only
// fixture inherits all of them by declaring the kind, and — more importantly — that REMOVING the kind
// to make a control drawable is a visible edit to its manifest rather than a silent divergence between
// prose and behaviour.
const SIZE_ONLY_CONTROL = 'size-only-control';

const FIXTURES_DIR = resolve('tools', 'size', 'fixtures');

function captureManifestPath(name: string): string {
  return join(FIXTURES_DIR, name, 'tool-capture.json');
}

// ★ COMMENTS ARE STRIPPED BEFORE MATCHING. These fixtures document what they deliberately avoid —
// "canvasShapeCommandTable() is deliberately avoided", "NOT the aggregate webHost" — so a detector
// that reads raw text fails on the very prose explaining the rule it enforces. The subject here is
// what the fixture BINDS, which lives in code, not in its explanation.
function fixtureSource(name: string): string {
  const dir = join(FIXTURES_DIR, name, 'src');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => stripComments(readFileSync(join(dir, file), 'utf8')))
    .join('\n');
}

function sizeKind(name: string): string | null {
  const contents = JSON.parse(readFileSync(join(FIXTURES_DIR, name, 'package.json'), 'utf8')) as {
    flightSize?: { kind?: unknown };
  };
  return typeof contents.flightSize?.kind === 'string' ? contents.flightSize.kind : null;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
}

// Value imports only. `import type` is erased before a byte is bundled, so counting it would let a
// type-only difference look like a difference in what a fixture actually pays for.
function valueImports(name: string): ReadonlySet<string> {
  const source = fixtureSource(name);
  const imports = new Set<string>();
  for (const match of source.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s*from\s*'([^']+)'/gu)) {
    for (const specifier of match[1].split(',')) {
      const symbol = specifier
        .trim()
        .split(/\s+as\s+/u)[0]
        .trim();
      if (symbol.length > 0 && !symbol.startsWith('type ')) imports.add(`${match[2]}:${symbol}`);
    }
  }
  return imports;
}

const CONTROL_FIXTURES = FEATURE_FIXTURES.filter((fixture) => sizeKind(fixture) === SIZE_ONLY_CONTROL);
const DRAWING_FIXTURES = FEATURE_FIXTURES.filter((fixture) => sizeKind(fixture) !== SIZE_ONLY_CONTROL);

describe('canvas size fixture isolation', () => {
  it('binds no aggregate pipeline, command table, or host enabler', () => {
    for (const fixture of FEATURE_FIXTURES) {
      const source = fixtureSource(fixture);
      for (const aggregate of AGGREGATES) {
        expect(source, `${fixture} must not reach ${aggregate}`).not.toMatch(new RegExp(`\\b${aggregate}\\b`, 'u'));
      }
    }
  });

  // ★ The aggregate host is the easy one to import by reflex, because every app example uses it. A
  // fixture that pulls `webHost` in measures every provider the web host carries, not the Canvas
  // surface it meant to isolate.
  it('reaches only the single Canvas surface provider, never the aggregate webHost', () => {
    for (const fixture of FEATURE_FIXTURES) {
      const source = fixtureSource(fixture);
      expect(source, `${fixture} must not import webHost`).not.toMatch(/\bwebHost\b/u);
      expect(source, `${fixture} needs the Canvas surface provider`).toContain('webCanvasRenderSurfaceCreator');
    }
  });

  it('registers exactly the one renderer its feature requires', () => {
    for (const fixture of DRAWING_FIXTURES) {
      const source = fixtureSource(fixture);
      const bound = [...source.matchAll(/\bdefaultCanvas(\w+Renderer)\b/gu)].map((match) => `defaultCanvas${match[1]}`);
      expect([...new Set(bound)].sort(), `${fixture} renderer set`).toEqual([...ALLOWED_RENDERER[fixture]].sort());
    }
  });

  // Renderer isolation across backends: a Canvas fixture that reaches a GL or WGPU symbol would be
  // measuring two backends at once, and its number would be quietly meaningless rather than wrong.
  it('reaches no other renderer backend', () => {
    for (const fixture of FEATURE_FIXTURES) {
      const source = fixtureSource(fixture);
      for (const foreign of ['scene2d-gl', 'scene2d-wgpu', 'render-gl', 'render-wgpu']) {
        expect(source, `${fixture} must not reach ${foreign}`).not.toContain(`@flighthq/${foreign}`);
      }
    }
  });

  // Registering a resolver is what makes a texture-sampling feature actually draw, so this is checked
  // in both directions rather than as a "does not reach" rule.
  //
  // ★ MATCHED AS A CALL. Testing for the bare name is satisfied by the import statement, so deleting
  // the registration left this green — the fixture would import the resolver, never register it, draw
  // nothing, and still report a plausible size. That is the failure this assertion exists to catch, so
  // matching the name would have made it decorative.
  it('registers the image texture resolver exactly when its feature samples a texture', () => {
    for (const fixture of FEATURE_FIXTURES) {
      const registers = /\bregisterCanvasImageTextureResolver\s*\(/u.test(fixtureSource(fixture));
      const expected = (TEXTURE_FIXTURES as readonly string[]).includes(fixture);
      expect(registers, `${fixture} texture resolver`).toBe(expected);
    }
  });

  // The glyph seam has a static half (bitmapfont) and a dynamic half (glyphatlas). A BitmapText fixture
  // that reached the rasterizer would price a feature it does not use, and the two are easy to confuse
  // because both satisfy GlyphSource.
  it('reaches only the static half of the glyph seam', () => {
    for (const fixture of FEATURE_FIXTURES) {
      expect(fixtureSource(fixture), `${fixture} must not reach the dynamic glyph atlas`).not.toContain(
        '@flighthq/glyphatlas',
      );
    }
  });

  // The emitter fixture measures the drawable node, not the headless simulation that can drive it.
  it('measures the particle emitter node without the particle simulation', () => {
    const source = fixtureSource('scene2d-canvas-particleemitter2d');
    expect(source).toContain('@flighthq/particleemitter');
    expect(source, 'the emitter fixture must not pull in the headless simulation').not.toMatch(
      /@flighthq\/particles'/u,
    );
  });

  it('declares canvas as its only capture renderer', () => {
    for (const fixture of DRAWING_FIXTURES) {
      const manifest = JSON.parse(readFileSync(captureManifestPath(fixture), 'utf8')) as {
        entries: readonly { name: string; renderers: readonly string[] }[];
      };
      expect(manifest.entries).toHaveLength(1);
      expect(manifest.entries[0].name).toBe(fixture);
      expect(manifest.entries[0].renderers).toEqual(['canvas']);
    }
  });
});

// Everything a fixture declaring `flightSize.kind: size-only-control` must satisfy. These are the
// obligations that come WITH the declaration, so the manifest field is a real constraint rather than a
// label — declaring the kind and then drawing something fails here.
describe('size-only control fixture', () => {
  // A floor that does not exist makes every marginal-cost claim in this set unfounded, and a SECOND
  // floor makes "the floor" ambiguous — two different subtrahends would both look authoritative.
  it('is declared exactly once across the canvas fixtures', () => {
    expect(CONTROL_FIXTURES).toEqual(['scene2d-canvas-transform']);
  });

  // The defining property. If it ever grows a renderer it stops being a floor, and every marginal-cost
  // claim derived from it silently becomes wrong rather than failing.
  it('registers no renderer and draws no visible content', () => {
    for (const fixture of CONTROL_FIXTURES) {
      const source = fixtureSource(fixture);
      expect(source, `${fixture} must bind no renderer`).not.toMatch(/\bdefaultCanvas\w+Renderer\b/u);
      expect(source, `${fixture} must not register a renderer`).not.toMatch(/\bregisterRenderer\b/u);
    }
  });

  // It still has to run the real pre-render path, or it would measure a scene nobody prepares and the
  // subtraction would credit the features with substrate the floor never paid for.
  //
  // ★ MATCHED AS CALLS, NOT AS NAMES. A bare `toContain('prepareScene2DRender')` is satisfied by the
  // import statement alone, so deleting the call site left this test green — the fixture would import
  // the update pass, never run it, and still claim to be the floor for scenes that do.
  it('still drives the pre-render pass it is the floor for', () => {
    for (const fixture of CONTROL_FIXTURES) {
      const source = fixtureSource(fixture);
      expect(source, `${fixture} must run the update pass`).toMatch(/\bprepareScene2DRender\s*\(/u);
      expect(source, `${fixture} must draw the background`).toMatch(/\brenderCanvasBackground\s*\(/u);
    }
  });

  // Carrying no capture manifest is REQUIRED, not incidental. Registering no renderer means it draws
  // only the background, and tool-capture rejects that as blank — correctly, since a digest of an empty
  // frame is a well-formed hash of no render. A manifest here would be a permanently failing capture.
  it('carries no capture manifest', () => {
    for (const fixture of CONTROL_FIXTURES) {
      expect(existsSync(captureManifestPath(fixture)), `${fixture} must not declare a capture`).toBe(false);
    }
  });

  // The comparator role, checked structurally rather than by trusting the prose. "Floor" means every
  // feature fixture pays everything the control pays and then its one feature on top; if the control
  // ever reached for something a feature fixture does not, the two would sit on DIFFERENT substrates
  // and (feature − control) would silently stop being a marginal cost.
  it('imports a subset of every fixture it is the comparator for', () => {
    for (const control of CONTROL_FIXTURES) {
      const floor = valueImports(control);
      for (const fixture of DRAWING_FIXTURES) {
        const feature = valueImports(fixture);
        const missing = [...floor].filter((symbol) => !feature.has(symbol)).sort();
        expect(missing, `${fixture} must pay everything ${control} pays`).toEqual([]);
      }
    }
  });
});
