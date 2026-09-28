import { MD5_MATERIAL_FEATURE, MD5_SKELETON_FEATURE } from '@flighthq/types/contract';

import { md5MaterialFamily } from './md5MaterialHandler.ts';
import { md5AllSectionHandlers } from './md5SectionRegistry.ts';
import { md5SkeletonFamily } from './md5SkeletonHandler.ts';

describe('md5AllSectionHandlers', () => {
  it('contains every family', () => {
    const all = new Set(md5AllSectionHandlers);
    for (const family of [md5SkeletonFamily, md5MaterialFamily]) {
      for (const handler of family) expect(all.has(handler)).toBe(true);
    }
    expect(md5AllSectionHandlers.length).toBe(md5SkeletonFamily.length + md5MaterialFamily.length);
  });

  it('claims each feature once, so two handlers cannot claim the same one', () => {
    const features = md5AllSectionHandlers.map((handler) => handler.feature);
    expect(features.length).toBe(new Set(features).size);
  });

  // Unlike MD2's family, the order of THIS array does not decide which handler runs first: the two claim
  // features dispatched at different points in the parse, so the parser's two dispatch points do. Pinned so
  // a future reader does not infer an ordering guarantee that is not there.
  it('covers exactly the two features the parse dispatches', () => {
    expect([...md5AllSectionHandlers.map((handler) => handler.feature)].sort()).toEqual(
      [MD5_MATERIAL_FEATURE, MD5_SKELETON_FEATURE].sort(),
    );
  });
});
