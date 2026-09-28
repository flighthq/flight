import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const srcDir = join(root, 'packages', 'scene2d-formats', 'src');

// The selective core, and the only modules it may reach. It takes the registry it is given and resolves no default, so
// naming a registrar here — or the preset — would put every family into the module graph of every caller.
const CORE = 'riveScene2D.ts';

// One marker per family: a symbol that exists ONLY if that family's interpretation was linked. These are the
// interpretation, not the registrar — a registrar shim is a few hundred bytes and proves nothing about what it reaches.
const FAMILY_MARKERS: Readonly<Record<string, string>> = {
  animation: 'createRiveAnimationClips',
  assets: 'registerRiveAssetHandlers',
  clipping: 'applyRiveClipping',
  kernel: 'createMartinezPathBooleanKernel',
  layout: 'importRiveLayoutComponent',
  paintDraw: 'appendRiveShapePaint',
  path: 'importRivePathComponent',
  preset: 'registerAllRiveHandlers',
  shape: 'importRiveShapeComponent',
  skeleton: 'createRiveSkeleton2D',
  stateMachine: 'createRiveStateMachines',
  text: 'importRiveTextComponent',
};

// Each subset, and exactly which markers may appear in its bundle. Everything else in the table above must be ABSENT.
//
// ★ `rive-import-paint` LINKS NO PAINT DRAWING, AND THAT IS CORRECT RATHER THAN BROKEN. The paint registrar installs a
// data pass for the fill, stroke, gradient and stop types; the drawing is `appendRiveShapePaint`, called by the SHAPE
// family, because in this format only a shape draws and its paints are its children. So registering paints alone costs a
// registrar shim — measured at 1,037 raw bytes over the no-family floor — and the drawing arrives with the shape family,
// which is where `rive-import-path-shape` shows it. This is the one place the audit looked hardest for a Lottie-style
// always-live paint switch and found ownership already correct.
const SUBSET_MARKERS: readonly (readonly [string, readonly string[]])[] = [
  ['rive-import-core', []],
  ['rive-import-path-shape', ['path', 'shape', 'paintDraw']],
  ['rive-import-paint', []],
  ['rive-import-text', ['text']],
  ['rive-import-assets', ['assets']],
  ['rive-import-clipping', ['clipping', 'kernel']],
  ['rive-import-skeleton', ['skeleton']],
  ['rive-import-layout', ['layout']],
  ['rive-import-state-machine', ['stateMachine']],
];

// Minimum saving each subset must show against the zero-config import, set below the WEAKER of the two baselines.
//
// Measured, minified / unminified gzip: full 30586 / 55990, path-shape 16765 / 26457, clipping 13501 / 20314,
// layout 11629 / 16981, text 11378 / 21140, assets 10246 / 14800, skeleton 9433 / 13700, state-machine 9381 / 13378,
// paint 9014 / 12732, core 8957 / 12528.
const SAVINGS: readonly (readonly [string, number])[] = [
  ['rive-import-core', 0.6],
  ['rive-import-path-shape', 0.35],
  ['rive-import-paint', 0.6],
  ['rive-import-text', 0.5],
  ['rive-import-assets', 0.55],
  ['rive-import-clipping', 0.45],
  ['rive-import-skeleton', 0.6],
  ['rive-import-layout', 0.5],
  ['rive-import-state-machine', 0.6],
];

describe('rive locality', () => {
  // ★ THE SELECTIVE CORE MUST NAME NO PRESET AND NO REGISTRAR. The audit found it importing `registerAllRiveHandlers`,
  // because the zero-config wrapper lived in the same module. esbuild shook the unused import — an empty-registry import
  // measured identical either way — but the coupling was one reachable reference away from costing every family, and a
  // source-level claim cannot be gated while it is false. The wrapper now lives in `riveImport.ts`.
  it('keeps the selective core free of the preset and of every registrar', () => {
    const source = codeOf(join(srcDir, CORE));
    expect(source).not.toContain('registerAllRiveHandlers');
    expect(source).not.toContain('riveHandlers.ts');
    expect(source.match(/registerRive\w+Handlers/g)).toBeNull();
  });

  // ★ AND THE PRESET IS NAMED BY EXACTLY THREE MODULES, EACH FOR A STATED REASON. The preset itself declares it; the
  // wrapper resolves the zero-config default through it; and the requirements analyzer registers it into a THROWAWAY
  // registry to read back which core-type keys each family claims — that one is build-time analysis on the contract lane,
  // deliberately derived from the shipped registrars instead of a hand-copied table of 368 object-model keys. Anything
  // else naming it would be a caller paying for every family to reach one.
  it('names the preset only from the modules that own a default or derive the family roots', () => {
    const owners = riveSources().filter((file) => codeOf(join(srcDir, file)).includes('registerAllRiveHandlers'));
    expect(owners.sort()).toEqual(['riveHandlers.ts', 'riveImport.ts', 'riveRequirements.ts']);
  });

  // ★ ANIMATION IS A FAMILY, AND THIS IS THE REGRESSION GUARD FOR IT. The clip reader used to be called unconditionally
  // by the artboard import, so every Rive build carried the whole keyframe, interpolation and binding reader whatever it
  // registered — 24,926 raw bytes, 30% of an import that registered no family at all. It is now an artboard pass like the
  // state machine family's, so it appears only when it is registered.
  it('leaves the animation reader out of every subset that does not register it', async () => {
    for (const [fixture] of SUBSET_MARKERS) {
      const code = await bundleFixture(fixture);
      expect(code.includes(FAMILY_MARKERS.animation), `${fixture} links the animation reader`).toBe(false);
    }
    expect(await bundleFixture('rive-import')).toContain(FAMILY_MARKERS.animation);
  });

  // ★ ABSENCE READ OUT OF A REAL BUNDLE, WHICH IS THE ONLY PLACE IT IS TRUE OR FALSE. A structural import check says what
  // a module names; this says what survives, family by family, for every subset at once.
  it.each(SUBSET_MARKERS)('links only its own families in %s', async (fixture, allowed) => {
    const code = await bundleFixture(fixture);
    expect(code.length).toBeGreaterThan(1000);
    for (const [family, marker] of Object.entries(FAMILY_MARKERS)) {
      if (family === 'preset') continue;
      expect(code.includes(marker), `${fixture} ${allowed.includes(family) ? 'lost' : 'links'} ${family}`).toBe(
        allowed.includes(family),
      );
    }
  });

  it.each(SAVINGS)('saves at least the stated fraction for %s against the full import', (subset, fraction) => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      expect(sizes[`${subset}:canvas`], `${subset} missing from ${baseline}`).toBeGreaterThan(0);
      expect(sizes[`${subset}:canvas`], `${subset} vs rive-import in ${baseline}`).toBeLessThan(
        sizes['rive-import:canvas'] * (1 - fraction),
      );
    }
  });

  // Registering a family must cost more than declining it — the ordering that makes the numbers above meaningful rather
  // than a coincidence of thresholds.
  it('charges more for every family than for the no-family floor', () => {
    for (const baseline of ['size.baseline.json', 'size.unminified.baseline.json']) {
      const sizes = readBaseline(baseline);
      const floor = sizes['rive-import-core:canvas'];
      for (const [subset] of SUBSET_MARKERS) {
        if (subset === 'rive-import-core') continue;
        expect(sizes[`${subset}:canvas`], `${subset} vs the floor in ${baseline}`).toBeGreaterThan(floor);
      }
      expect(sizes['rive-import:canvas'], baseline).toBeGreaterThan(sizes['rive-import-path-shape:canvas']);
    }
  });
});

// ★ EACH FIXTURE IS BUNDLED ONCE AND SHARED. Ten subsets read by three different assertions is nineteen esbuild runs if
// each asks for its own, and this file runs alongside the rest of `test:scripts` — enough added CPU to starve a
// neighbouring suite's 60-second hook budget, which is how the first version of this gate failed `capability-arrival`
// without anything being wrong with either. The cache makes the cost ten builds, paid once.
const bundles = new Map<string, Promise<string>>();

function bundleFixture(fixture: string): Promise<string> {
  const cached = bundles.get(fixture);
  if (cached !== undefined) return cached;
  const pending = build({
    bundle: true,
    entryPoints: [join(root, 'tools', 'size', 'fixtures', fixture, 'src', 'render.canvas.ts')],
    format: 'esm',
    keepNames: true,
    logLevel: 'error',
    write: false,
  }).then((result) => result.outputFiles[0].text);
  bundles.set(fixture, pending);
  return pending;
}

// A file's CODE, with comment lines stripped. The core's own comments discuss the preset and the registrars it must not
// reach, and a scan that read them would report the very coupling those comments exist to rule out.
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

function readBaseline(name: string): Record<string, number> {
  return JSON.parse(readFileSync(join(root, 'tools', 'size', name), 'utf8')) as Record<string, number>;
}

function riveSources(): string[] {
  return readdirSync(srcDir).filter(
    (file) => file.startsWith('rive') && file.endsWith('.ts') && !file.endsWith('.test.ts'),
  );
}
