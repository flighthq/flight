import { BitmapCompositeMode } from './BitmapCompositeMode';

describe('BitmapCompositeMode', () => {
  it('carries canonical PascalCase values equal to their keys', () => {
    expect(BitmapCompositeMode.Multiply).toBe('Multiply');
    expect(BitmapCompositeMode.DestinationOut).toBe('DestinationOut');
    expect(BitmapCompositeMode.Subtract).toBe('Subtract');
    expect(BitmapCompositeMode.Invert).toBe('Invert');
  });

  it('unifies both axes: color blends and Porter-Duff coverage operators', () => {
    // A color blend and a coverage operator both live in the one vocabulary.
    expect(BitmapCompositeMode.Overlay).toBe('Overlay');
    expect(BitmapCompositeMode.DestinationIn).toBe('DestinationIn');
  });

  it('shares canonical string values so a GPU mode string is a valid BitmapCompositeMode', () => {
    const mode: BitmapCompositeMode = 'Multiply';
    expect(mode).toBe(BitmapCompositeMode.Multiply);
  });
});
