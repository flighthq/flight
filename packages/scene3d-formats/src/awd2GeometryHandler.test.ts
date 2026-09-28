import { awd2TriangleGeometryHandler } from './awd2GeometryHandler.ts';
import { AWD2_BLOCK_TRIANGLE_GEOMETRY } from './awd2Schema.ts';

describe('awd2TriangleGeometryHandler', () => {
  it('claims the triangle geometry block type', () => {
    expect(awd2TriangleGeometryHandler.blockTypes).toEqual([AWD2_BLOCK_TRIANGLE_GEOMETRY]);
  });

  it('has a parse function', () => {
    expect(typeof awd2TriangleGeometryHandler.parse).toBe('function');
  });

  it('declares no build phase', () => {
    expect(awd2TriangleGeometryHandler.buildPhase).toBeUndefined();
    expect(awd2TriangleGeometryHandler.build).toBeUndefined();
  });
});
