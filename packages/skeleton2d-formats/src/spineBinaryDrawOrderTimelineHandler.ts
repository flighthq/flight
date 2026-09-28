import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ByteReader,
  ImportDiagnostic,
  Skeleton2DDrawOrderTimeline,
  SpineBinaryTimelineContext,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, SpineBinaryTimelineKind as TimelineKind } from '@flighthq/types/contract';

import { tally } from './spineBinaryParseHelpers.ts';
import { isSpineBinaryReaderOverrun, readSpineBinaryFloat, readSpineBinaryVarint } from './spineBinaryReader.ts';
import { resolveSpineDrawOrdering } from './spineDrawOrder.ts';

export function skipSpineBinaryDrawOrderTimeline(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryDrawOrderTimeline(
    context.section.reader,
    context.section.slots.length,
    undefined,
    context.unregisteredTimelineCounts,
    TimelineKind.DrawOrder,
  );
}

export const spineBinaryDrawOrderTimelineReader: (context: SpineBinaryTimelineContext) => void =
  spineBinaryDrawOrderTimelineHandler;

function readSpineBinaryDrawOrderTimeline(context: SpineBinaryTimelineContext): void {
  context.drawOrder = consumeSpineBinaryDrawOrderTimeline(
    context.section.reader,
    context.section.slots.length,
    context.section.diagnostics,
  );
}

function consumeSpineBinaryDrawOrderTimeline(
  reader: ByteReader,
  slotCount: number,
  diagnostics?: ImportDiagnostic[],
  counts?: Map<string, number>,
  tallyKind?: string,
): Skeleton2DDrawOrderTimeline | null {
  const frames = readSpineBinaryVarint(reader);
  if (frames > 0 && counts !== undefined && tallyKind !== undefined) tally(counts, tallyKind);
  const times: number[] = [];
  const orderings: number[] = [];

  for (let i = 0; i < frames && !isSpineBinaryReaderOverrun(reader); i++) {
    const time = readSpineBinaryFloat(reader);
    const offsets = readSpineBinaryVarint(reader);
    const moves: { offset: number; slotIndex: number }[] = [];
    for (let j = 0; j < offsets && !isSpineBinaryReaderOverrun(reader); j++) {
      const slotIndex = readSpineBinaryVarint(reader);
      moves.push({ offset: readSpineBinaryVarint(reader), slotIndex });
    }
    if (isSpineBinaryReaderOverrun(reader)) break;

    const ordering = resolveSpineDrawOrdering(moves, slotCount);
    if (ordering === null) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'spine.draworder-keyframe-unresolved',
        'readSpineBinaryDrawOrderTimeline',
        { time },
      );
      continue;
    }
    times.push(time);
    orderings.push(...ordering);
  }
  return times.length === 0 ? null : { orderings, times };
}

export function spineBinaryDrawOrderTimelineHandler(context: SpineBinaryTimelineContext): void {
  readSpineBinaryDrawOrderTimeline(context);
}
