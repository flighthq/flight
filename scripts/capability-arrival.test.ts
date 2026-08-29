import { beforeAll, describe, expect, it } from 'vitest';

import type { CapabilityArrivalFailure, GeneratedEntry } from './capability-arrival';
import { capabilityArrivalFailures } from './capability-arrival';

type Removal = 'bitmap-readback' | 'functional-aggregate' | 'gl-surface' | 'video' | 'wgpu-surface';

function fixedEntry(entry: Readonly<GeneratedEntry>, removal?: Removal): string {
  const setup: string[] = [];
  if (entry.suite === 'functional') {
    setup.push(`import { enableHostWeb } from '@flighthq/host-web';`, 'enableHostWeb();');
  } else {
    if (entry.renderer === 'canvas' || entry.renderer === 'webgl') {
      setup.push(`import { enableHostWebBitmapReadback } from '@flighthq/host-web';`, 'enableHostWebBitmapReadback();');
    }
    if (entry.consumer.startsWith('examples:video/')) {
      setup.push(
        `import { enableHostWebVideoCapability } from '@flighthq/host-web';`,
        'enableHostWebVideoCapability();',
      );
    }
  }

  let source = `${setup.join('\n')}\n${entry.source}`;
  if (removal === 'bitmap-readback') source = source.replace('enableHostWebBitmapReadback();', '');
  if (removal === 'video') source = source.replace('enableHostWebVideoCapability();', '');
  if (removal === 'functional-aggregate') source = source.replace('enableHostWeb();', '');
  if (removal === 'gl-surface' && entry.consumer === 'examples:shapes/webgl') {
    source = source.replace('enableHostWebGlRenderSurface();', '');
  }
  if (removal === 'wgpu-surface' && entry.consumer === 'examples:shapes/webgpu') {
    source = source.replace('enableHostWebWgpuRenderSurface();', '');
  }
  return source;
}

async function analyze(removal?: Removal): Promise<CapabilityArrivalFailure[]> {
  return capabilityArrivalFailures({ transformGeneratedEntry: (entry) => fixedEntry(entry, removal) });
}

function arrivalNames(failures: readonly CapabilityArrivalFailure[]): string[] {
  return failures.map((failure) => `${failure.consumer ?? '-'}:${failure.capability ?? '-'}:${failure.kind}`);
}

describe('capability-arrival source gate', () => {
  let baseline: CapabilityArrivalFailure[];

  beforeAll(async () => {
    baseline = await analyze();
  }, 60_000);

  it('accepts the complete source-derived registry, exact 632-cell population, and repaired entries', () => {
    // This clean baseline also proves that identity-only getter reads and pure constructors do not turn
    // into consumers: the call graph marks a capability only inside its owning selector-using package.
    expect(baseline).toEqual([]);
  });

  it('reddens every Canvas/WebGL example when BitmapReadback is removed from the generated entry', async () => {
    const failures = await analyze('bitmap-readback');

    expect(failures).toHaveLength(68);
    expect(new Set(failures.map((failure) => failure.capability))).toEqual(new Set(['BitmapReadback']));
    expect(arrivalNames(failures)).toContain('examples:shapes/canvas:BitmapReadback:arrival');
    expect(arrivalNames(failures)).toContain('examples:shapes/webgl:BitmapReadback:arrival');
  });

  it('reddens all four interactive video routes when VideoCapability is removed', async () => {
    const failures = await analyze('video');

    expect(arrivalNames(failures)).toEqual([
      'examples:video/dom:VideoCapability:arrival',
      'examples:video/canvas:VideoCapability:arrival',
      'examples:video/webgl:VideoCapability:arrival',
      'examples:video/webgpu:VideoCapability:arrival',
    ]);
  });

  it('reddens the functional generated-entry owner when its aggregate is removed', async () => {
    const failures = await analyze('functional-aggregate');

    expect(arrivalNames(failures)).toEqual(['functional generated-entry template:enableHostWeb aggregate:policy']);
    expect(failures[0]?.message).toContain('absent from 500 cells');
  });

  it('reddens a named GL page when its explicit surface arrival is removed', async () => {
    expect(arrivalNames(await analyze('gl-surface'))).toContain('examples:shapes/webgl:GlRenderSurface:arrival');
  });

  it('reddens a named WGPU page when its explicit surface arrival is removed', async () => {
    expect(arrivalNames(await analyze('wgpu-surface'))).toContain('examples:shapes/webgpu:WgpuRenderSurface:arrival');
  });
});
