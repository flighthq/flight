// Generated from crates/flight-entity/tests/explain_entity_runtime_write_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { EntityRuntimeWriteSlot, explainEntityRuntimeWrite } from './contract.ts';

describe('explainEntityRuntimeWriteTests', () => {
  it('names both binding helpers for a binding slot write', () => {
    const explanation = explainEntityRuntimeWrite(EntityRuntimeWriteSlot.BindingSlot);
    expect(explanation.slot).toEqual(EntityRuntimeWriteSlot.BindingSlot);
    expect(explanation.useInstead).toEqual(['attachEntityBinding', 'detachEntityBinding']);
  });
  it('names the allocating helper for a runtime slot write', () => {
    const explanation = explainEntityRuntimeWrite(EntityRuntimeWriteSlot.RuntimeSlot);
    expect(explanation.slot).toEqual(EntityRuntimeWriteSlot.RuntimeSlot);
    expect(explanation.useInstead).toEqual(['attachEntityBinding']);
  });
  it('distinguishes the two slots by message not only by name', () => {
    expect(explainEntityRuntimeWrite(EntityRuntimeWriteSlot.BindingSlot).message).not.toEqual(
      explainEntityRuntimeWrite(EntityRuntimeWriteSlot.RuntimeSlot).message,
    );
  });
});
