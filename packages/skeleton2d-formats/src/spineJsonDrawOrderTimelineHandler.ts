import type { SpineJsonTimelineContext } from '@flighthq/types/contract';

import { parseSpineDrawOrderTimeline } from './spineParse.ts';

export function spineJsonDrawOrderTimelineHandler(
  context: SpineJsonTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  context.drawOrder = parseSpineDrawOrderTimeline(
    animEntry.drawOrder ?? animEntry.draworder,
    context.section.slots,
    context.section.diagnostics,
  );
}

export const spineJsonDrawOrderTimelineReader = spineJsonDrawOrderTimelineHandler;
