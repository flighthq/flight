import type { SwfTagHandler, SwfTagReader } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';

describe('composeSwfTagHandlers', () => {
  it('merges the tags of all handlers into one flat array', () => {
    const a: SwfTagHandler = { tags: [1, 2], parse: () => true };
    const b: SwfTagHandler = { tags: [3], parse: () => true };
    const composed = composeSwfTagHandlers([a, b]);
    expect(composed.tags).toEqual([1, 2, 3]);
  });

  it('dispatches parse to the handler that owns the tag code', () => {
    const calls: number[] = [];
    const a: SwfTagHandler = {
      tags: [10],
      parse: (_body, tag) => {
        calls.push(tag);
        return true;
      },
    };
    const b: SwfTagHandler = {
      tags: [20],
      parse: (_body, tag) => {
        calls.push(tag);
        return false;
      },
    };
    const composed = composeSwfTagHandlers([a, b]);
    const body = {} as SwfTagReader;
    composed.parse(body, 20, {} as never, {} as never, undefined);
    composed.parse(body, 10, {} as never, {} as never, undefined);
    expect(calls).toEqual([20, 10]);
  });

  it('returns true when parse receives an unrecognized tag code', () => {
    const composed = composeSwfTagHandlers([{ tags: [5], parse: () => false }]);
    expect(composed.parse({} as SwfTagReader, 99, {} as never, {} as never, undefined)).toBe(true);
  });

  it('omits resolve when no handler defines it', () => {
    const composed = composeSwfTagHandlers([{ tags: [1], parse: () => true }]);
    expect(composed.resolve).toBeUndefined();
  });

  it('composes resolve across all handlers that define it', () => {
    const calls: string[] = [];
    const a: SwfTagHandler = {
      tags: [1],
      parse: () => true,
      resolve: () => {
        calls.push('a');
      },
    };
    const b: SwfTagHandler = { tags: [2], parse: () => true };
    const c: SwfTagHandler = {
      tags: [3],
      parse: () => true,
      resolve: () => {
        calls.push('c');
      },
    };
    const composed = composeSwfTagHandlers([a, b, c]);
    composed.resolve!({} as never, {} as never);
    expect(calls).toEqual(['a', 'c']);
  });

  it('omits finishTimeline when no handler defines it', () => {
    const composed = composeSwfTagHandlers([{ tags: [1], parse: () => true }]);
    expect(composed.finishTimeline).toBeUndefined();
  });

  it('composes finishTimeline across all handlers that define it', () => {
    const calls: string[] = [];
    const a: SwfTagHandler = {
      tags: [1],
      parse: () => true,
      finishTimeline: () => {
        calls.push('a');
      },
    };
    const b: SwfTagHandler = {
      tags: [2],
      parse: () => true,
      finishTimeline: () => {
        calls.push('b');
      },
    };
    const composed = composeSwfTagHandlers([a, b]);
    composed.finishTimeline!({} as never, {} as never);
    expect(calls).toEqual(['a', 'b']);
  });

  it('omits instantiate when no handler defines it', () => {
    const composed = composeSwfTagHandlers([{ tags: [1], parse: () => true }]);
    expect(composed.instantiate).toBeUndefined();
  });

  it('composes createResources across all handlers that define it', () => {
    const calls: string[] = [];
    const a: SwfTagHandler = {
      instantiate: {
        createResources: () => {
          calls.push('a');
        },
      },
      tags: [1],
      parse: () => true,
    };
    const b: SwfTagHandler = {
      instantiate: {
        createResources: () => {
          calls.push('b');
        },
      },
      tags: [2],
      parse: () => true,
    };
    const composed = composeSwfTagHandlers([a, b]);
    composed.instantiate!.createResources!({} as never, {} as never);
    expect(calls).toEqual(['a', 'b']);
  });

  it('returns the first non-null result from createPlacementNode', () => {
    const a: SwfTagHandler = {
      instantiate: { createPlacementNode: () => null },
      tags: [1],
      parse: () => true,
    };
    const sentinel = {} as never;
    const b: SwfTagHandler = {
      instantiate: { createPlacementNode: () => sentinel },
      tags: [2],
      parse: () => true,
    };
    const composed = composeSwfTagHandlers([a, b]);
    expect(composed.instantiate!.createPlacementNode!({} as never, 1, null, undefined)).toBe(sentinel);
  });

  it('returns true from hasPlacementContent when any handler returns true', () => {
    const a: SwfTagHandler = {
      instantiate: { hasPlacementContent: () => false },
      tags: [1],
      parse: () => true,
    };
    const b: SwfTagHandler = {
      instantiate: { hasPlacementContent: () => true },
      tags: [2],
      parse: () => true,
    };
    const composed = composeSwfTagHandlers([a, b]);
    expect(composed.instantiate!.hasPlacementContent!({} as never, 1)).toBe(true);
  });

  it('returns false from hasPlacementContent when all handlers return false', () => {
    const a: SwfTagHandler = {
      instantiate: { hasPlacementContent: () => false },
      tags: [1],
      parse: () => true,
    };
    const composed = composeSwfTagHandlers([a]);
    expect(composed.instantiate!.hasPlacementContent!({} as never, 1)).toBe(false);
  });
});
