import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { Attachment2D, DragonBonesSectionContext, ImportDiagnostic, Slot2D } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { numberOr } from './dragonBonesParseHelpers.ts';

export function dragonBonesSlotsSectionHandler(context: DragonBonesSectionContext): void {
  const slots = parseDragonBonesSlots(
    context.armature.slot,
    context.boneIndexByName,
    context.displayTable,
    context.diagnostics,
  );
  for (const slot of slots) context.slots.push(slot);
}

export const dragonBonesSlotsSectionReader: (context: DragonBonesSectionContext) => void =
  dragonBonesSlotsSectionHandler;

function colorChannel(value: unknown): number {
  return Math.max(0, Math.min(255, Math.round((numberOr(value, 100) / 100) * 255)));
}

function parseDragonBonesColor(raw: unknown, diagnostics?: ImportDiagnostic[]): number {
  if (raw === null || typeof raw !== 'object') return 0xffffffff;
  const color = raw as Record<string, unknown>;
  const r = colorChannel(color.rM);
  const g = colorChannel(color.gM);
  const b = colorChannel(color.bM);
  const a = colorChannel(color.aM);
  if (
    numberOr(color.rO, 0) !== 0 ||
    numberOr(color.gO, 0) !== 0 ||
    numberOr(color.bO, 0) !== 0 ||
    numberOr(color.aO, 0) !== 0
  ) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.color-offset-unsupported',
      'parseDragonBonesColor',
      { slots: 1 },
    );
  }
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

function parseDragonBonesSlots(
  raw: unknown,
  boneIndexByName: ReadonlyMap<string, number>,
  skin: ReadonlyMap<string, readonly (Attachment2D | null)[]>,
  diagnostics?: ImportDiagnostic[],
): Slot2D[] {
  const slots: Slot2D[] = [];
  if (!Array.isArray(raw)) return slots;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const slot = entry as Record<string, unknown>;
    const name = typeof slot.name === 'string' ? slot.name : null;
    const boneIndex = typeof slot.parent === 'string' ? (boneIndexByName.get(slot.parent) ?? -1) : -1;
    const displayIndex = numberOr(slot.displayIndex, 0) | 0;
    let attachment: Attachment2D | null = null;
    if (name !== null && displayIndex >= 0) {
      const displays = skin.get(name);
      if (displays !== undefined && displayIndex < displays.length) attachment = displays[displayIndex];
    }
    slots.push({ attachment, boneIndex, color: parseDragonBonesColor(slot.color, diagnostics), name });
  }
  return slots;
}
