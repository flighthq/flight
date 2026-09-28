import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2DSlotAnimationTarget } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  AttachmentSkin2D,
  ImportDiagnostic,
  Slot2D,
  SpineJsonTimelineContext,
} from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  AnimationInterpolationStep,
  ImportDiagnosticSeverity,
  Skeleton2DSlotAnimationPath,
} from '@flighthq/types/contract';

import {
  buildSpineSegmentEasings,
  indexOfSpineSlot,
  numberOr,
  parseSpineColor,
  SPINE_DEFAULT_SKIN_NAME,
  SPINE_NO_ATTACHMENT_INDEX,
} from './spineParseHelpers.ts';

export function spineJsonSlotTimelineHandler(
  context: SpineJsonTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  parseSpineSlotTimelines(
    context.channels,
    animEntry.slots,
    context.section.slots,
    context.section.skins,
    context.section.diagnostics,
  );
}

export const spineJsonSlotTimelineReader = spineJsonSlotTimelineHandler;

// Slot timelines. Only `rgba` is modeled — it becomes a four-component 0..1 colour channel on a
// `Skeleton2DSlotAnimationTarget`. Spine writes the colour as an "rrggbbaa" hex string per keyframe and its
// curve control points in that same 0..1 space, so the track carries normalized channels rather than bytes.
//
// `rgb`, `alpha`, and the two dark-colour variants are recognized but not modeled: `Slot2D` has one packed
// colour and no dark colour, so a partial-channel timeline cannot be represented without inventing a setup
// blend. `attachment` swaps are a separate landing (index track + lookup table). Each is Skip-crumbed.
function parseSpineSlotTimelines(
  channels: ReturnType<typeof createAnimationChannel>[],
  raw: unknown,
  slots: readonly Slot2D[],
  skins: readonly AttachmentSkin2D[],
  diagnostics?: ImportDiagnostic[],
): void {
  if (raw === null || typeof raw !== 'object') return;
  const unmodeled = new Map<string, number>();
  for (const [slotName, timelinesEntry] of Object.entries(raw as Record<string, unknown>)) {
    if (timelinesEntry === null || typeof timelinesEntry !== 'object') continue;
    const slotIndex = indexOfSpineSlot(slots, slotName);
    for (const [kind, keys] of Object.entries(timelinesEntry as Record<string, unknown>)) {
      if (kind !== 'rgba' && kind !== 'attachment') {
        unmodeled.set(kind, (unmodeled.get(kind) ?? 0) + 1);
        continue;
      }
      if (slotIndex < 0 || !Array.isArray(keys) || keys.length === 0) continue;
      if (kind === 'attachment') addSpineSlotAttachmentChannel(channels, keys, slotIndex, slotName, skins);
      else addSpineSlotColorChannel(channels, keys, slotIndex, diagnostics);
    }
  }
  for (const [kind, count] of unmodeled) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      `spine.slot-${kind}-timeline-unsupported`,
      'parseSpineSlotTimelines',
      { timelines: count },
    );
  }
}

// One `rgba` slot timeline → a Color channel. Reuses the shared bezier rebase, which is why the values must
// be in the same 0..1 space the curve control points are authored in.
function addSpineSlotColorChannel(
  channels: ReturnType<typeof createAnimationChannel>[],
  rawKeys: readonly unknown[],
  slotIndex: number,
  diagnostics?: ImportDiagnostic[],
): void {
  const keys: Record<string, unknown>[] = [];
  const times: number[] = [];
  const values: number[] = [];
  let allStepped = true;
  for (const key of rawKeys) {
    if (key === null || typeof key !== 'object') continue;
    const k = key as Record<string, unknown>;
    keys.push(k);
    times.push(numberOr(k.time, 0));
    const packed = parseSpineColor(k.color);
    values.push(
      ((packed >>> 24) & 0xff) / 255,
      ((packed >>> 16) & 0xff) / 255,
      ((packed >>> 8) & 0xff) / 255,
      (packed & 0xff) / 255,
    );
    if (k.curve !== 'stepped') allStepped = false;
  }
  if (times.length === 0) return;
  const interpolation = allStepped ? AnimationInterpolationStep : AnimationInterpolationLinear;
  const segmentEasings = buildSpineSegmentEasings(keys, times, values, 4, diagnostics);
  const track = createAnimationTrack({ components: 4, interpolation, segmentEasings, times, values });
  channels.push(
    createAnimationChannel(track, createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Color)),
  );
}

// One `attachment` slot timeline → a STEP channel of indices into a per-channel attachment table.
//
// The keyframes name attachments by string; the table resolves each name ONCE here, against the setup skin,
// and the track then carries only the index. A keyframe with no name becomes `-1` — Spine's way of hiding a
// slot, which spineboy's `shoot` uses to extinguish muzzle flashes. Names that the setup skin does not
// supply also become `-1` rather than being dropped, because dropping a keyframe would shift the timing of
// every later swap.
//
// The table is deduplicated: a flash cycling through four images and back writes each attachment once.
function addSpineSlotAttachmentChannel(
  channels: ReturnType<typeof createAnimationChannel>[],
  rawKeys: readonly unknown[],
  slotIndex: number,
  slotName: string,
  skins: readonly AttachmentSkin2D[],
): void {
  const setup = skins.find((skin) => skin.name === SPINE_DEFAULT_SKIN_NAME) ?? skins[0];
  const attachments: (Attachment2D | null)[] = [];
  const indexByName = new Map<string, number>();
  const times: number[] = [];
  const values: number[] = [];
  for (const key of rawKeys) {
    if (key === null || typeof key !== 'object') continue;
    const k = key as Record<string, unknown>;
    times.push(numberOr(k.time, 0));
    const name = typeof k.name === 'string' ? k.name : null;
    if (name === null) {
      values.push(SPINE_NO_ATTACHMENT_INDEX);
      continue;
    }
    let index = indexByName.get(name);
    if (index === undefined) {
      const found = setup?.attachments.find((entry) => entry.slotIndex === slotIndex && entry.name === name);
      index = found === undefined ? SPINE_NO_ATTACHMENT_INDEX : attachments.push(found.attachment) - 1;
      indexByName.set(name, index);
    }
    values.push(index);
  }
  if (times.length === 0) return;
  const track = createAnimationTrack({
    components: 1,
    interpolation: AnimationInterpolationStep,
    times,
    values,
  });
  channels.push(
    createAnimationChannel(
      track,
      createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Attachment, attachments),
    ),
  );
}
