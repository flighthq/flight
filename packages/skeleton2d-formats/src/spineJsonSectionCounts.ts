import { SpineJsonSectionKind, SpineJsonTimelineKind } from '@flighthq/types/contract';

export function collectSpineJsonSectionCounts(json: string): Map<string, number> | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  if (!isSpineJson(record)) return null;
  const counts = new Map<string, number>();
  countSection(counts, record, 'bones', SpineJsonSectionKind.Bones);
  countSection(counts, record, 'slots', SpineJsonSectionKind.Slots);
  countSection(counts, record, 'skins', SpineJsonSectionKind.Skins);
  countSection(counts, record, 'events', SpineJsonSectionKind.Events);
  countSection(counts, record, 'ik', SpineJsonSectionKind.IkConstraints);
  countSection(counts, record, 'path', SpineJsonSectionKind.PathConstraints);
  countSection(counts, record, 'transform', SpineJsonSectionKind.TransformConstraints);
  countAnimationTimelines(counts, record.animations);
  return counts;
}

function isSpineJson(record: Readonly<Record<string, unknown>>): boolean {
  return (
    (Array.isArray(record.bones) || (record.skeleton !== null && typeof record.skeleton === 'object')) &&
    !Array.isArray(record.armature)
  );
}

function countSection(
  counts: Map<string, number>,
  record: Readonly<Record<string, unknown>>,
  jsonKey: string,
  kind: string,
): void {
  const value = record[jsonKey];
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    if (value.length > 0) counts.set(kind, value.length);
  } else if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) counts.set(kind, keys.length);
  }
}

function countAnimationTimelines(counts: Map<string, number>, raw: unknown): void {
  if (raw === null || typeof raw !== 'object') return;
  const animations = Object.values(raw as Record<string, unknown>);
  if (animations.length === 0) return;
  counts.set(SpineJsonSectionKind.Animations, animations.length);
  for (const animEntry of animations) {
    if (animEntry === null || typeof animEntry !== 'object') continue;
    const anim = animEntry as Record<string, unknown>;
    tallyTimeline(counts, anim.bones, SpineJsonTimelineKind.Bone);
    tallyTimeline(counts, anim.slots, SpineJsonTimelineKind.Slot);
    tallyTimeline(counts, anim.deform, SpineJsonTimelineKind.Deform);
    tallyTimeline(counts, anim.drawOrder ?? anim.draworder, SpineJsonTimelineKind.DrawOrder);
    tallyTimeline(counts, anim.events, SpineJsonTimelineKind.Event);
    tallyTimeline(counts, anim.ik, SpineJsonTimelineKind.Ik);
    tallyTimeline(counts, anim.path, SpineJsonTimelineKind.Path);
    tallyTimeline(counts, anim.transform, SpineJsonTimelineKind.Transform);
  }
}

function tallyTimeline(counts: Map<string, number>, raw: unknown, kind: string): void {
  if (raw === undefined || raw === null) return;
  let count = 0;
  if (Array.isArray(raw)) count = raw.length;
  else if (typeof raw === 'object') count = Object.keys(raw as Record<string, unknown>).length;
  if (count > 0) counts.set(kind, (counts.get(kind) ?? 0) + count);
}
