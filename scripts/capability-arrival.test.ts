import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { CapabilityArrivalFailure, GeneratedEntry } from './capability-arrival';
import { capabilityArrivalFailures } from './capability-arrival';

type Removal =
  | 'bitmap-readback'
  | 'functional-aggregate'
  | 'gl-surface'
  | 'media-session-host'
  | 'video'
  | 'wgpu-surface';

const ROOT = resolve(import.meta.dirname, '..');
const VIDEO_APP = 'examples/packages/video/src/app.ts';
const WEB_HOST = 'packages/host-web/src/webHost.ts';

interface RemovalControl {
  readonly after: number;
  readonly before: number;
  readonly specimen: string;
}

interface AnalysisResult {
  readonly controls: readonly RemovalControl[];
  readonly failures: readonly CapabilityArrivalFailure[];
}

function occurrenceCount(source: string, occurrence: string): number {
  return source.split(occurrence).length - 1;
}

function removeRequiredOccurrence(
  source: string,
  occurrence: string,
  specimen: string,
  controls: RemovalControl[],
): string {
  const before = occurrenceCount(source, occurrence);
  if (before !== 1) throw new Error(`${specimen} must contain exactly one "${occurrence}"; found ${before}`);
  const result = source.replace(occurrence, '');
  const after = occurrenceCount(result, occurrence);
  if (after !== 0) throw new Error(`${specimen} mutation left ${after} ${occurrence} occurrence(s)`);
  controls.push({ after, before, specimen });
  return result;
}

function mutateGeneratedEntry(
  entry: Readonly<GeneratedEntry>,
  removal: Removal | undefined,
  controls: RemovalControl[],
): string {
  let source = entry.source;
  if (
    removal === 'bitmap-readback' &&
    entry.suite === 'examples' &&
    (entry.renderer === 'canvas' || entry.renderer === 'webgl')
  ) {
    source = removeRequiredOccurrence(source, 'enableHostWebBitmapReadback();', entry.consumer, controls);
  }
  if (removal === 'functional-aggregate' && entry.suite === 'functional') {
    source = removeRequiredOccurrence(source, 'enableHostWeb();', entry.consumer, controls);
  }
  if (removal === 'gl-surface' && entry.consumer === 'examples:shapes/webgl') {
    source = removeRequiredOccurrence(source, 'enableHostWebGlRenderSurface();', entry.consumer, controls);
  }
  if (removal === 'wgpu-surface' && entry.consumer === 'examples:shapes/webgpu') {
    source = removeRequiredOccurrence(source, 'enableHostWebWgpuRenderSurface();', entry.consumer, controls);
  }
  return source;
}

async function analyze(removal?: Removal): Promise<AnalysisResult> {
  const controls: RemovalControl[] = [];
  const failures = await capabilityArrivalFailures({
    transformGeneratedEntry: (entry) => mutateGeneratedEntry(entry, removal, controls),
    transformSource:
      removal === 'video' || removal === 'media-session-host'
        ? ({ path, source }) => {
            if (removal === 'video' && path === VIDEO_APP) {
              return removeRequiredOccurrence(source, 'enableHostWebVideoCapability();', path, controls);
            }
            if (removal === 'media-session-host' && path === WEB_HOST) {
              return removeRequiredOccurrence(source, 'sessionAction: webMediaSessionActionBackend', path, controls);
            }
            return source;
          }
        : undefined,
  });
  return { controls, failures };
}

function arrivalNames(failures: readonly CapabilityArrivalFailure[]): string[] {
  return failures.map((failure) => `${failure.consumer ?? '-'}:${failure.capability ?? '-'}:${failure.kind}`);
}

describe('capability-arrival source gate', () => {
  let baseline: CapabilityArrivalFailure[];

  beforeAll(async () => {
    const result = await analyze();
    expect(result.controls).toEqual([]);
    baseline = [...result.failures];
  }, 60_000);

  it('accepts the complete source-derived registry, exact 632-cell population, and repaired entries', () => {
    // This clean baseline also proves that identity-only getter reads and pure constructors do not turn
    // into consumers: the call graph marks a capability only inside its owning selector-using package.
    expect(baseline).toEqual([]);
  });

  it('refuses a mutation when its real specimen is absent or duplicated', () => {
    expect(() => removeRequiredOccurrence('unrelated();', 'enableHostWeb();', 'missing', [])).toThrow(
      'missing must contain exactly one "enableHostWeb();"; found 0',
    );
    expect(() =>
      removeRequiredOccurrence('enableHostWeb(); enableHostWeb();', 'enableHostWeb();', 'duplicate', []),
    ).toThrow('duplicate must contain exactly one "enableHostWeb();"; found 2');
  });

  it('reddens every Canvas/WebGL example when BitmapReadback is removed from the generated entry', async () => {
    const { controls, failures } = await analyze('bitmap-readback');

    expect(controls).toHaveLength(68);
    expect(new Set(controls.map(({ after, before }) => `${before}->${after}`))).toEqual(new Set(['1->0']));
    expect(failures).toHaveLength(68);
    expect(new Set(failures.map((failure) => failure.capability))).toEqual(new Set(['BitmapReadback']));
    expect(arrivalNames(failures)).toContain('examples:shapes/canvas:BitmapReadback:arrival');
    expect(arrivalNames(failures)).toContain('examples:shapes/webgl:BitmapReadback:arrival');
  });

  it('reddens all four interactive video routes when VideoCapability is removed', async () => {
    const evidenceControls: RemovalControl[] = [];
    const mutatedApp = removeRequiredOccurrence(
      readFileSync(join(ROOT, VIDEO_APP), 'utf8'),
      'enableHostWebVideoCapability();',
      VIDEO_APP,
      evidenceControls,
    );
    const { controls, failures } = await analyze('video');

    // Capture still uses its three canvas-backed fake resources and never loads a video. The only
    // removed statement is in the else branch, so these failures prove static interactive reachability.
    expect(mutatedApp).toContain(
      'setVideoSources(createCaptureVideoResource(), createCaptureVideoResource(), createCaptureVideoResource());',
    );
    expect(mutatedApp).toContain('loadVideoResourceFromBlob(blob, opts)');
    expect(mutatedApp).not.toContain('enableHostWebVideoCapability();');
    expect(evidenceControls).toEqual([{ after: 0, before: 1, specimen: VIDEO_APP }]);
    expect(controls).toEqual([{ after: 0, before: 1, specimen: VIDEO_APP }]);
    expect(arrivalNames(failures)).toEqual([
      'examples:video/dom:VideoCapability:arrival',
      'examples:video/canvas:VideoCapability:arrival',
      'examples:video/webgl:VideoCapability:arrival',
      'examples:video/webgpu:VideoCapability:arrival',
    ]);
    // A timeout here is a hang detector, not a performance budget: this mutation rewrites the video app
    // and re-analyzes every arrival route, so its wall time tracks whatever else the suite is running.
    // Sized for headroom over the observed tail rather than close to it, so ordinary contention cannot
    // redden it while a genuinely wedged run still terminates.
  }, 120_000);

  it('reddens the functional generated-entry owner when its aggregate is removed', async () => {
    const { controls, failures } = await analyze('functional-aggregate');
    const names = arrivalNames(failures);
    const policy = failures.find((failure) => failure.kind === 'policy');

    expect(controls).toHaveLength(500);
    expect(new Set(controls.map(({ after, before }) => `${before}->${after}`))).toEqual(new Set(['1->0']));
    expect(names).toContain('functional generated-entry template:enableHostWeb aggregate:policy');
    expect(names).toContain('functional:application-render-view/webgl:BitmapReadback:arrival');
    expect(policy?.message).toContain('absent from 500 cells');
  });

  it('reddens a named GL page when its explicit surface arrival is removed', async () => {
    const { controls, failures } = await analyze('gl-surface');

    expect(controls).toEqual([{ after: 0, before: 1, specimen: 'examples:shapes/webgl' }]);
    expect(arrivalNames(failures)).toContain('examples:shapes/webgl:GlRenderSurface:arrival');
  });

  it('reddens a named WGPU page when its explicit surface arrival is removed', async () => {
    const { controls, failures } = await analyze('wgpu-surface');

    expect(controls).toEqual([{ after: 0, before: 1, specimen: 'examples:shapes/webgpu' }]);
    expect(arrivalNames(failures)).toContain('examples:shapes/webgpu:WgpuRenderSurface:arrival');
  });

  it('reddens when the explicit Web Host loses half of the MediaSession shape', async () => {
    const { controls, failures } = await analyze('media-session-host');

    expect(controls).toEqual([{ after: 0, before: 1, specimen: WEB_HOST }]);
    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'registry',
        message: expect.stringContaining('expected [MediaSession, Screen, Storage], found [Screen, Storage]'),
      }),
    ]);
  });
});
