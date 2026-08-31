import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// The per-feature Canvas size fixtures. Each measures the container-only floor plus exactly ONE
// feature, so a marginal feature cost is (fixture − scene2d-canvas-transform). That subtraction is
// only meaningful while each fixture stays isolated, which is what this file guards.
const FEATURE_FIXTURES = ['scene2d-canvas-shape', 'scene2d-canvas-text', 'scene2d-canvas-transform'] as const;

// The renderer each fixture is allowed to bind. `scene2d-canvas-transform` binds none by design — it
// IS the floor.
const ALLOWED_RENDERER: Record<string, readonly string[]> = {
  'scene2d-canvas-shape': ['defaultCanvasShapeRenderer'],
  'scene2d-canvas-text': ['defaultCanvasTextLabelRenderer'],
  'scene2d-canvas-transform': [],
};

// Aggregates whose whole purpose is to bind everything at once. A per-feature fixture that reaches one
// stops measuring its feature and starts measuring the aggregate.
const AGGREGATES = ['scene2dCanvasPipeline', 'canvasShapeCommandTable', 'enableHostWeb'] as const;

// The subset that draws something and therefore has a capture manifest.
const CAPTURABLE_FIXTURES = ['scene2d-canvas-shape', 'scene2d-canvas-text'] as const;

const FIXTURES_DIR = resolve('tools', 'size', 'fixtures');

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

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
}

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
    for (const fixture of FEATURE_FIXTURES) {
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

  // Only the drawing fixtures carry a capture manifest. scene2d-canvas-transform registers no renderer,
  // so it draws only the background and tool-capture rejects the frame as blank — correctly, since a
  // digest of an empty frame is a well-formed hash of no render. It is a size-only fixture.
  it('declares canvas as its only capture renderer', () => {
    for (const fixture of CAPTURABLE_FIXTURES) {
      const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, fixture, 'tool-capture.json'), 'utf8')) as {
        entries: readonly { name: string; renderers: readonly string[] }[];
      };
      expect(manifest.entries).toHaveLength(1);
      expect(manifest.entries[0].name).toBe(fixture);
      expect(manifest.entries[0].renderers).toEqual(['canvas']);
    }
  });

  // The floor fixture is what makes the others subtractable. If it ever grows a renderer it stops
  // being a floor, and every marginal-cost claim derived from it silently becomes wrong.
  it('keeps the container-only fixture free of any renderer registration', () => {
    const source = fixtureSource('scene2d-canvas-transform');
    expect(source).not.toMatch(/\bdefaultCanvas\w+Renderer\b/u);
    expect(source).toContain('prepareScene2DRender');
  });

  // Guards the pairing itself: a fixture that draws nothing must not claim a capture manifest, and a
  // drawing fixture must have one. Getting this backwards produces either a permanently failing
  // capture or a silently uncaptured scene.
  it('gives a capture manifest to exactly the fixtures that draw', () => {
    for (const fixture of FEATURE_FIXTURES) {
      const hasManifest = readdirSync(join(FIXTURES_DIR, fixture)).includes('tool-capture.json');
      expect(hasManifest, `${fixture} manifest presence`).toBe(
        (CAPTURABLE_FIXTURES as readonly string[]).includes(fixture),
      );
    }
  });
});
