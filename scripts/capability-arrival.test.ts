import { beforeAll, describe, expect, it } from 'vitest';

import type { CapabilityArrivalFailure } from './capability-arrival';
import { capabilityArrivalFailures } from './capability-arrival';

describe('capability-arrival source gate', () => {
  let baseline: CapabilityArrivalFailure[];

  beforeAll(async () => {
    baseline = [...(await capabilityArrivalFailures({}))];
  }, 60_000);

  it('accepts the source-derived registry and every discovered entry', () => {
    // This clean baseline also proves that identity-only getter reads and pure constructors do not turn
    // into consumers: the call graph marks a capability only inside its owning selector-using package.
    expect(baseline).toEqual([]);
  });
});

// This gate has no mutation proof left. Both specimens were provider singletons whose arrival was the
// thing being checked — WgpuRenderSurface went first, and GlRenderSurface went when surface creation moved
// to the per-kind host capabilities, so there is no longer a page whose surface arrives separately from
// the call that uses it. Deleting a capability argument from a consumer no longer reddens this gate, which
// means the clean baseline above is currently unfalsified rather than verified.
