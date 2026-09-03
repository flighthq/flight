import { explainEntityRuntimeWrite } from './explainEntityRuntimeWrite';

describe('explainEntityRuntimeWrite', () => {
  it('names both binding helpers for a binding-slot write', () => {
    const explanation = explainEntityRuntimeWrite('binding-slot');
    expect(explanation.slot).toBe('binding-slot');
    expect(explanation.useInstead).toEqual(['attachEntityBinding', 'detachEntityBinding']);
  });

  it('names the allocating helper for a runtime-slot write', () => {
    const explanation = explainEntityRuntimeWrite('runtime-slot');
    expect(explanation.slot).toBe('runtime-slot');
    expect(explanation.useInstead).toEqual(['attachEntityBinding']);
  });

  it('distinguishes the two slots by message, not only by name', () => {
    expect(explainEntityRuntimeWrite('binding-slot').message).not.toBe(
      explainEntityRuntimeWrite('runtime-slot').message,
    );
  });
});
