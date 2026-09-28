import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type {
  AttachmentSkin2D,
  ImportDiagnostic,
  Skeleton2DDrawOrderTimeline,
  Skeleton2DImport,
  Slot2D,
  SpineJsonRegistry,
  SpineJsonSectionContext,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { resolveSpineDrawOrdering } from './spineDrawOrder.ts';
import { indexOfSpineSlot, numberOr, SPINE_DEFAULT_SKIN_NAME } from './spineParseHelpers.ts';

/**
 * Reads a draw-order timeline into the orderings `Skeleton2DImport` carries.
 *
 * The wire form states, per keyframe, a time and a list of slots that MOVE, each with a signed offset
 * from its setup position; every slot not listed keeps its relative order and closes the gaps. A track
 * has to answer "what is in effect at time t" from one keyframe alone, so each keyframe is resolved
 * into a WHOLE ordering here rather than left as a list of moves to be applied in sequence.
 *
 * Resolution is direct: place every moved slot at its stated destination, then fill the positions
 * nobody claimed with the remaining slots in setup order. A destination outside the slot range, or two
 * slots claiming one position, would silently reorder the rest — so the keyframe is skipped and
 * crumbed instead.
 */
export function parseSpineDrawOrderTimeline(
  raw: unknown,
  slots: readonly Slot2D[],
  diagnostics?: ImportDiagnostic[],
): Skeleton2DDrawOrderTimeline | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const times: number[] = [];
  const orderings: number[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const frame = entry as Record<string, unknown>;
    const ordering = resolveSpineDrawOrder(frame.offsets, slots);
    if (ordering === null) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'spine.draworder-keyframe-unresolved',
        'parseSpineDrawOrderTimeline',
        { time: numberOr(entry.time, 0) },
      );
      continue;
    }
    times.push(numberOr(entry.time, 0));
    orderings.push(...ordering);
  }
  return times.length === 0 ? null : { orderings, times };
}

export function parseSpineSkeletonWithRegistry(
  json: string,
  registry: Readonly<SpineJsonRegistry>,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  const context: SpineJsonSectionContext = {
    animations: [],
    attachmentNames: [],
    bones: [],
    diagnostics,
    doc: record,
    registry,
    skins: [],
    slots: [],
  };
  for (const entry of registry.sectionHandlers) {
    entry.handle(context);
  }
  resolveSpineSetupAttachments(context.slots, context.attachmentNames, context.skins);
  const skeleton = createSkeleton2D(context.bones, context.slots);
  if (context.skins.length > 0) skeleton.skins = context.skins;
  return { animations: context.animations, skeleton };
}

function resolveSpineDrawOrder(raw: unknown, slots: readonly Slot2D[]): number[] | null {
  const moves: { offset: number; slotIndex: number }[] = [];
  if (Array.isArray(raw)) {
    for (const offset of raw) {
      if (offset === null || typeof offset !== 'object') continue;
      const move = offset as { offset?: unknown; slot?: unknown };
      const slotIndex = indexOfSpineSlot(slots, typeof move.slot === 'string' ? move.slot : '');
      if (slotIndex < 0) return null;
      moves.push({ offset: numberOr(move.offset, 0), slotIndex });
    }
  }
  return resolveSpineDrawOrdering(moves, slots.length);
}

function resolveSpineSetupAttachments(
  slots: Slot2D[],
  attachmentNames: readonly (string | null)[],
  skins: readonly AttachmentSkin2D[],
): void {
  const setup = skins.find((skin) => skin.name === SPINE_DEFAULT_SKIN_NAME) ?? skins[0];
  if (setup === undefined) return;
  for (const entry of setup.attachments) {
    if (entry.slotIndex < slots.length && attachmentNames[entry.slotIndex] === entry.name) {
      slots[entry.slotIndex].attachment = entry.attachment;
    }
  }
}
