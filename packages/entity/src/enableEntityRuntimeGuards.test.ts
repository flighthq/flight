import type { Entity } from '@flighthq/types/contract';
import type { EntityRuntimeWriteSlot } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { disableEntityRuntimeGuards, enableEntityRuntimeGuards } from './enableEntityRuntimeGuards';
import { allocateEntity, finishEntity } from './entity';
import { areEntityRuntimeGuardsEnabled, createGuardedEntity, createGuardedEntityRuntime } from './guards';
import { createEntityRuntime } from './runtime';

function createTestEntity(): Entity {
  return finishEntity(allocateEntity<Entity>());
}

// Every case runs the write under a reporter that records the slot, so what is asserted is what the
// caller's reporter actually received — not that some sink somewhere was touched.
function recordSlots(write: () => void): readonly EntityRuntimeWriteSlot[] {
  const slots: EntityRuntimeWriteSlot[] = [];
  enableEntityRuntimeGuards((slot) => slots.push(slot));
  try {
    write();
  } finally {
    disableEntityRuntimeGuards();
  }
  return slots;
}

describe('disableEntityRuntimeGuards', () => {
  it('uninstalls both the proxies and the reporter', () => {
    const slots: EntityRuntimeWriteSlot[] = [];
    enableEntityRuntimeGuards((slot) => slots.push(slot));
    disableEntityRuntimeGuards();
    createGuardedEntity(createTestEntity())[EntityRuntimeKey] = undefined;
    expect(slots).toEqual([]);
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });
});

describe('enableEntityRuntimeGuards', () => {
  it('REPORTS a direct runtime-slot write to the caller-supplied reporter', () => {
    expect(recordSlots(() => (createGuardedEntity(createTestEntity())[EntityRuntimeKey] = undefined))).toEqual([
      'runtime-slot',
    ]);
  });

  it('REPORTS a direct binding-slot write separately', () => {
    expect(recordSlots(() => (createGuardedEntityRuntime(createEntityRuntime()).binding = null))).toEqual([
      'binding-slot',
    ]);
  });

  it('stays SILENT without the guard — the production default', () => {
    const slots: EntityRuntimeWriteSlot[] = [];
    createGuardedEntity(createTestEntity())[EntityRuntimeKey] = undefined;
    expect(slots).toEqual([]);
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });
});
