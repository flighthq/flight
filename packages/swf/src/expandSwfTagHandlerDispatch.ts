import type { SwfTagHandler, SwfTagHandlerDispatch } from '@flighthq/types/contract';

// Expands a handler array into the flat tag-code table a tag walk dispatches through. This module
// imports no handler, which is what keeps the import boundary structural rather than a favour from a
// tree shaker: the walk reaches only this file, so a build that names its own handlers has no handler
// it did not name anywhere in its module graph. `swfAllTagHandlers`, which does name all ten families,
// is in a file of its own for exactly that reason.
//
// Built once per import rather than per tag, so the per-tag cost is a single lookup however many
// handlers are named. A tag claimed by more than one handler resolves to the last one named: handlers
// are data the caller ordered, and last-write-wins lets a caller override a stock handler by appending
// their own rather than having to rebuild the array without it.
export function expandSwfTagHandlerDispatch(tags: readonly SwfTagHandler[]): SwfTagHandlerDispatch {
  const dispatch = new Map<number, Readonly<SwfTagHandler>>();
  for (const handler of tags) {
    for (const tag of handler.tags) dispatch.set(tag, handler);
  }
  return dispatch;
}
