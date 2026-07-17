import { ModifierSlot } from './ModifierSlot';

describe('ModifierSlot', () => {
  it('exposes the v1 slot taxonomy as canonical PascalCase values', () => {
    expect(ModifierSlot.Diffuse).toBe('Diffuse');
    expect(ModifierSlot.Specular).toBe('Specular');
    expect(ModifierSlot.Normal).toBe('Normal');
    expect(ModifierSlot.Emissive).toBe('Emissive');
    expect(ModifierSlot.Effect).toBe('Effect');
  });

  it('is open — a vendor-prefixed slot satisfies the type', () => {
    const custom: ModifierSlot = 'acme.Displacement';
    expect(custom).toBe('acme.Displacement');
  });

  it('does not reserve ambient/shadow as active members in v1', () => {
    expect((ModifierSlot as Record<string, string>).Ambient).toBeUndefined();
    expect((ModifierSlot as Record<string, string>).Shadow).toBeUndefined();
  });
});
