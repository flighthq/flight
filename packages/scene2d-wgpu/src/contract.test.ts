import {
  defaultWgpuDrawEllipse,
  defaultWgpuDrawRoundedRectangle,
  defaultWgpuQuadraticCurveTo,
  defaultWgpuShapeCommands,
} from './contract';

describe('defaultWgpuShapeCommands', () => {
  it('carries every canonical geometry descriptor through the WGPU renderer assembly', () => {
    expect(defaultWgpuQuadraticCurveTo.key).toBe('quadraticCurveTo');
    expect(defaultWgpuDrawEllipse.key).toBe('drawEllipse');
    expect(defaultWgpuDrawRoundedRectangle.key).toBe('drawRoundedRectangle');
    expect(defaultWgpuShapeCommands).toEqual(
      expect.arrayContaining([defaultWgpuQuadraticCurveTo, defaultWgpuDrawEllipse, defaultWgpuDrawRoundedRectangle]),
    );
  });
});
