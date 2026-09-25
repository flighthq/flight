import type { SwfTagHandler } from '@flighthq/types/contract';

import * as swfContract from './contract';
import { swfAllTagHandlers } from './swfAllTagHandlers';
import { SWF_TAG_NODE_KINDS } from './swfNodeKinds';

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

  // ★ THE TAG-TO-KIND MAP IS CHECKED AGAINST THE HANDLERS, NOT TRUSTED. `SWF_TAG_NODE_KINDS` lives in
  // its own module so it can be tree-shaken out of runtime builds, which also means nothing at run time
  // would ever notice it going stale. A tag whose handler builds a node but which the map omits is
  // invisible to the build-time translation: the document resolves its parser handler and silently gets
  // no renderer, which shows up as a blank screen rather than a build error.
  it('maps every tag whose handler builds a placement node', () => {
    for (const handler of swfAllTagHandlers) {
      if (handler.instantiate?.createPlacementNode === undefined) continue;
      for (const code of handler.tags) {
        const kinds = SWF_TAG_NODE_KINDS.get(code);
        expect(kinds, `tag ${code} builds a node but declares no kind`).toBeDefined();
        expect(kinds!.length).toBeGreaterThan(0);
      }
    }
  });

  // The converse: a kind declared for a tag that builds nothing puts a renderer in a build that never
  // draws with it, which is the bundle cost this pipeline exists to remove.
  it('maps no tag whose handler builds nothing', () => {
    const building = new Set(
      swfAllTagHandlers.filter((h) => h.instantiate?.createPlacementNode !== undefined).flatMap((h) => h.tags),
    );
    for (const code of SWF_TAG_NODE_KINDS.keys()) {
      expect(building.has(code), `tag ${code} declares kinds but builds no placement node`).toBe(true);
    }
  });

  it('covers both directions with real handlers, so neither check is vacuous', () => {
    const builders = swfAllTagHandlers.filter((h) => h.instantiate?.createPlacementNode !== undefined);
    expect(builders.length).toBeGreaterThan(0);
    expect(swfAllTagHandlers.length).toBeGreaterThan(builders.length);
    expect(SWF_TAG_NODE_KINDS.size).toBeGreaterThan(0);
  });
});
