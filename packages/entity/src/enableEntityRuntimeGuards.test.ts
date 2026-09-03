import type { EntityRuntimeWriteSlot } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { disableEntityRuntimeGuards, enableEntityRuntimeGuards } from './enableEntityRuntimeGuards';
import { createEntity } from './entity';
import { areEntityRuntimeGuardsEnabled, createGuardedEntity, createGuardedEntityRuntime } from './guards';
import { createEntityRuntime } from './runtime';

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
    createGuardedEntity(createEntity())[EntityRuntimeKey] = undefined;
    expect(slots).toEqual([]);
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });
});

describe('enableEntityRuntimeGuards', () => {
  it('REPORTS a direct runtime-slot write to the caller-supplied reporter', () => {
    expect(recordSlots(() => (createGuardedEntity(createEntity())[EntityRuntimeKey] = undefined))).toEqual([
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
    createGuardedEntity(createEntity())[EntityRuntimeKey] = undefined;
    expect(slots).toEqual([]);
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });
});
