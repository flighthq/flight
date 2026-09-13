import {
  defaultGlDrawEllipse,
  defaultGlDrawRoundedRectangle,
  defaultGlQuadraticCurveTo,
  defaultGlShapeCommands,
} from './contract';

describe('defaultGlShapeCommands', () => {
  it('carries every canonical geometry descriptor through the GL renderer assembly', () => {
    expect(defaultGlQuadraticCurveTo.key).toBe('quadraticCurveTo');
    expect(defaultGlDrawEllipse.key).toBe('drawEllipse');
    expect(defaultGlDrawRoundedRectangle.key).toBe('drawRoundedRectangle');
    expect(defaultGlShapeCommands).toEqual(
      expect.arrayContaining([defaultGlQuadraticCurveTo, defaultGlDrawEllipse, defaultGlDrawRoundedRectangle]),
    );
  });
});
