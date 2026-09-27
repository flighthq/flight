import { DragonBonesSectionKind, DragonBonesTimelineKind } from '@flighthq/types/contract';

export function collectDragonBonesSectionCounts(json: string): Map<string, number> | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  if (!isDragonBones(record)) return null;
  const armatures = record.armature as unknown[];
  if (armatures.length === 0) return new Map();
  const first = armatures[0];
  if (first === null || typeof first !== 'object') return new Map();
  const armature = first as Record<string, unknown>;
  const counts = new Map<string, number>();
  countSection(counts, armature, 'bone', DragonBonesSectionKind.Bones);
  countSection(counts, armature, 'slot', DragonBonesSectionKind.Slots);
  countSection(counts, armature, 'skin', DragonBonesSectionKind.Skins);
  countSection(counts, armature, 'ik', DragonBonesSectionKind.IkConstraints);
  countAnimationTimelines(counts, armature.animation);
  return counts;
}

function isDragonBones(record: Readonly<Record<string, unknown>>): boolean {
  return Array.isArray(record.armature);
}

function countSection(
  counts: Map<string, number>,
  record: Readonly<Record<string, unknown>>,
  jsonKey: string,
  kind: string,
): void {
  const value = record[jsonKey];
  if (!Array.isArray(value) || value.length === 0) return;
  counts.set(kind, value.length);
}

function countAnimationTimelines(counts: Map<string, number>, raw: unknown): void {
  if (!Array.isArray(raw) || raw.length === 0) return;
  counts.set(DragonBonesSectionKind.Animations, raw.length);
  for (const animEntry of raw) {
    if (animEntry === null || typeof animEntry !== 'object') continue;
    const anim = animEntry as Record<string, unknown>;
    tallyTimeline(counts, anim.bone, DragonBonesTimelineKind.Bone);
    tallyTimeline(counts, anim.slot, DragonBonesTimelineKind.Slot);
    tallyTimeline(counts, anim.ffd, DragonBonesTimelineKind.Deform);
    tallyTimeline(counts, anim.ik, DragonBonesTimelineKind.Ik);
    tallyTimeline(counts, anim.zOrder, DragonBonesTimelineKind.ZOrder);
  }
}

function tallyTimeline(counts: Map<string, number>, raw: unknown, kind: string): void {
  if (!Array.isArray(raw) || raw.length === 0) return;
  counts.set(kind, (counts.get(kind) ?? 0) + raw.length);
}
