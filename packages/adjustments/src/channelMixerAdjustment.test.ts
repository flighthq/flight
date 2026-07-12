import { createChannelMixerAdjustment } from './channelMixerAdjustment';
import { applyColorMatrixToColor } from './colorMatrixMath';

describe('createChannelMixerAdjustment', () => {
  it('rotates channels via a 3×4 row-major mix and carries the fusable kind', () => {
    // R<-B, G<-R, B<-G — the same mix the functional scene uses.
    const adjustment = createChannelMixerAdjustment({ matrix: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0] });
    expect(adjustment.kind).toBe('ChannelMixerAdjustment');
    expect(adjustment.colorMatrix).toHaveLength(20);
    // 0xAABBCC → R'=CC (from blue), G'=AA (from red), B'=BB (from green); alpha preserved.
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0xaabbccff)).toBe(0xccaabbff);
  });

  it('defaults to the identity mix', () => {
    const adjustment = createChannelMixerAdjustment();
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x123456ff)).toBe(0x123456ff);
  });

  it('applies the per-row offset in normalized 0–1, scaled to the 0–255 column', () => {
    // Identity mix plus a full-white offset on every row → saturates to white.
    const adjustment = createChannelMixerAdjustment({ matrix: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] });
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x102030ff)).toBe(0xffffffff);
  });
});
