import { SurfaceCompositeMode } from './SurfaceCompositeMode';

describe('SurfaceCompositeMode', () => {
  it('carries canonical PascalCase values equal to their keys', () => {
    expect(SurfaceCompositeMode.Multiply).toBe('Multiply');
    expect(SurfaceCompositeMode.DestinationOut).toBe('DestinationOut');
    expect(SurfaceCompositeMode.Subtract).toBe('Subtract');
    expect(SurfaceCompositeMode.Invert).toBe('Invert');
  });

  it('unifies both axes: color blends and Porter-Duff coverage operators', () => {
    // A color blend and a coverage operator both live in the one vocabulary.
    expect(SurfaceCompositeMode.Overlay).toBe('Overlay');
    expect(SurfaceCompositeMode.DestinationIn).toBe('DestinationIn');
  });

  it('shares canonical string values so a GPU mode string is a valid SurfaceCompositeMode', () => {
    const mode: SurfaceCompositeMode = 'Multiply';
    expect(mode).toBe(SurfaceCompositeMode.Multiply);
  });
});
