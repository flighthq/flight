import type { Bone2D, Slot2D, SpineJsonSectionContext } from '@flighthq/types/contract';

import { parseSpineColor } from './spineParseHelpers.ts';

export function spineJsonSlotsSectionHandler(context: SpineJsonSectionContext): void {
  const { attachmentNames, slots } = parseSpineSlots(context.doc.slots, context.bones);
  for (const slot of slots) context.slots.push(slot);
  for (const name of attachmentNames) context.attachmentNames.push(name);
}

function parseSpineSlots(
  raw: unknown,
  bones: readonly Bone2D[],
): { attachmentNames: (string | null)[]; slots: Slot2D[] } {
  const attachmentNames: (string | null)[] = [];
  const slots: Slot2D[] = [];
  if (!Array.isArray(raw)) return { attachmentNames, slots };
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const slot = entry as Record<string, unknown>;
    const name = typeof slot.name === 'string' ? slot.name : null;
    let boneIndex = -1;
    if (typeof slot.bone === 'string') {
      for (let i = 0; i < bones.length; i++) {
        if (bones[i].name === slot.bone) {
          boneIndex = i;
          break;
        }
      }
    }
    attachmentNames.push(typeof slot.attachment === 'string' ? slot.attachment : null);
    slots.push({ attachment: null, boneIndex, color: parseSpineColor(slot.color), name });
  }
  return { attachmentNames, slots };
}

export const spineJsonSlotsSectionReader = spineJsonSlotsSectionHandler;
