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

  // ★ THE TAG-TO-KIND FACT MUST NOT BE OPTIONAL IN PRACTICE. `producesKinds` is what lets a build-time
  // inventory turn a TAG requirement into a RENDERER requirement, and a handler that builds nodes
  // without declaring them is invisible to that translation: the document resolves its parser handler
  // and silently gets no renderer, which surfaces as a blank screen rather than a build error. So the
  // declaration is required exactly where it is knowable — a handler that constructs placement nodes.
  it('declares producesKinds on every handler that builds a placement node', () => {
    for (const handler of swfAllTagHandlers) {
      if (handler.instantiate?.createPlacementNode === undefined) continue;
      const kinds = handler.instantiate.producesKinds;
      expect(
        kinds,
        `a placement-node handler claiming tags ${handler.tags.join(', ')} declares no kinds`,
      ).toBeDefined();
      expect(kinds!.length).toBeGreaterThan(0);
      for (const kind of kinds!) expect(typeof kind === 'string' && kind.length > 0).toBe(true);
    }
  });

  // The converse: declaring kinds while building no node would put a renderer in a build that nothing
  // ever draws with, which is the bundle cost this whole pipeline exists to remove.
  it('declares producesKinds only where a placement node is actually built', () => {
    for (const handler of swfAllTagHandlers) {
      if (handler.instantiate?.createPlacementNode !== undefined) continue;
      expect(handler.instantiate?.producesKinds, `tags ${handler.tags.join(', ')}`).toBeUndefined();
    }
  });

  it('covers at least one handler in each direction, so neither check is vacuous', () => {
    const builders = swfAllTagHandlers.filter((h) => h.instantiate?.createPlacementNode !== undefined);
    const nonBuilders = swfAllTagHandlers.filter((h) => h.instantiate?.createPlacementNode === undefined);
    expect(builders.length).toBeGreaterThan(0);
    expect(nonBuilders.length).toBeGreaterThan(0);
  });
});
