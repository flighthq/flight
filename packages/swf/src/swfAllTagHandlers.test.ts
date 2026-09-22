import type { SwfTagHandler } from '@flighthq/types/contract';

import * as swfContract from './contract';
import { swfAllTagHandlers } from './swfAllTagHandlers';

// The families this package actually exports, read off the barrel rather than hand-listed. A list
// written here would have to be edited in lockstep with the package to keep meaning anything, and the
// test it feeds would pass for a family nobody remembered to add.
const exportedFamilies = Object.entries(swfContract as Record<string, unknown>).filter(
  (entry): entry is [string, readonly SwfTagHandler[]] =>
    /^swf[A-Z]\w*TagFamily$/u.test(entry[0]) && Array.isArray(entry[1]),
);

describe('swfAllTagHandlers', () => {
  // Guards the derivation itself: a regex that matched nothing would make every assertion below
  // vacuously true, which is the failure mode this test replaced.
  it('derives the family list from the package exports', () => {
    const names = exportedFamilies.map(([name]) => name);
    expect(names).toContain('swfShapeTagFamily');
    expect(names).toContain('swfPlacementTagFamily');
    expect(exportedFamilies.length).toBeGreaterThan(1);
  });

  // The preset is the zero-config path, and it is the only module naming every family. A family that
  // exists but is missing from it ships unreachable — no build could name it without hand-assembling
  // an array — and nothing else in the suite would notice.
  it('contains every tag family the package exports', () => {
    for (const [name, family] of exportedFamilies) {
      for (const handler of family) expect(swfAllTagHandlers, name).toContain(handler);
    }
  });

  // The reverse direction: a handler reachable through the preset but belonging to no exported family
  // would be unreachable selectively, which is the same defect seen from the other side.
  it('contains nothing that is not part of an exported family', () => {
    const owned = new Set(exportedFamilies.flatMap(([, family]) => family));
    for (const handler of swfAllTagHandlers) expect(owned).toContain(handler);
  });
});
