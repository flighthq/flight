import type { SwfTagHandler } from '@flighthq/types/contract';

import { expandSwfTagHandlerDispatch } from './expandSwfTagHandlerDispatch';
import { swfAllTagHandlers } from './swfAllTagHandlers';
import { swfShapeTagFamily } from './swfShapeTagFamily';

describe('expandSwfTagHandlerDispatch', () => {
  it('maps every tag a handler claims to that handler', () => {
    const dispatch = expandSwfTagHandlerDispatch(swfShapeTagFamily);
    for (const handler of swfShapeTagFamily) {
      for (const tag of handler.tags) expect(dispatch.get(tag)).toBe(handler);
    }
  });

  it('claims nothing for an empty handler array', () => {
    expect(expandSwfTagHandlerDispatch([]).size).toBe(0);
  });

  it('resolves a contested tag to the last handler named, so a caller can override by appending', () => {
    const [stock] = swfShapeTagFamily;
    const contested = stock!.tags[0]!;
    const override: SwfTagHandler = { parse: () => true, tags: [contested] };
    expect(expandSwfTagHandlerDispatch([...swfShapeTagFamily, override]).get(contested)).toBe(override);
    // ...and the reverse order proves the rule is order, not a preference for the custom handler.
    expect(expandSwfTagHandlerDispatch([override, ...swfShapeTagFamily]).get(contested)).toBe(stock);
  });

  it('covers every tag of every family through the full preset', () => {
    const dispatch = expandSwfTagHandlerDispatch(swfAllTagHandlers);
    for (const handler of swfAllTagHandlers) {
      for (const tag of handler.tags) expect(dispatch.has(tag)).toBe(true);
    }
    expect(dispatch.size).toBeGreaterThan(0);
  });
});
