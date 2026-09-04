import { beforeAll, describe, expect, it } from 'vitest';

import type { CapabilityArrivalFailure, GeneratedEntry } from './capability-arrival';
import { capabilityArrivalFailures } from './capability-arrival';

type Removal = 'gl-surface' | 'wgpu-surface';

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

  it('accepts the source-derived registry and every discovered entry', () => {
    // This clean baseline also proves that identity-only getter reads and pure constructors do not turn
    // into consumers: the call graph marks a capability only inside its owning selector-using package.
    expect(baseline).toEqual([]);
  });

  it('refuses a mutation when its real specimen is absent or duplicated', () => {
    expect(() => removeRequiredOccurrence('unrelated();', 'enableHostWebGlRenderSurface();', 'missing', [])).toThrow(
      'missing must contain exactly one "enableHostWebGlRenderSurface();"; found 0',
    );
    expect(() =>
      removeRequiredOccurrence(
        'enableHostWebGlRenderSurface(); enableHostWebGlRenderSurface();',
        'enableHostWebGlRenderSurface();',
        'duplicate',
        [],
      ),
    ).toThrow('duplicate must contain exactly one "enableHostWebGlRenderSurface();"; found 2');
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
});
