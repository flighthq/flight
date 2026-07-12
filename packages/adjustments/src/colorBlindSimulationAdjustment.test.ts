import { createColorBlindSimulationAdjustment } from './colorBlindSimulationAdjustment';
import { applyColorMatrixToColor } from './colorMatrixMath';

describe('createColorBlindSimulationAdjustment', () => {
  it('defaults to deuteranopia and bakes its linear matrix, preserving alpha', () => {
    const adjustment = createColorBlindSimulationAdjustment();
    expect(adjustment.kind).toBe('ColorBlindSimulationAdjustment');
    expect(adjustment.colorMatrix).toHaveLength(20);
    // Pure red under deuteranopia: R'=0.625·255≈159, G'=0.7·255≈179, B'=0; alpha preserved.
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0xff0000ff)).toBe(0x9fb300ff);
  });

  it('achromatopsia collapses to equal-channel luma (monochrome)', () => {
    const adjustment = createColorBlindSimulationAdjustment({ type: 'achromatopsia' });
    // Pure red → 0.299·255≈76 across all channels.
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0xff0000ff)).toBe(0x4c4c4cff);
  });

  it('selects a distinct matrix per type', () => {
    const protan = createColorBlindSimulationAdjustment({ type: 'protanopia' });
    const tritan = createColorBlindSimulationAdjustment({ type: 'tritanopia' });
    const green = 0x00ff00ff;
    expect(applyColorMatrixToColor(protan.colorMatrix as number[], green)).not.toBe(
      applyColorMatrixToColor(tritan.colorMatrix as number[], green),
    );
  });
});
