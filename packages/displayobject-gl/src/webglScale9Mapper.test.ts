import { createRectangle } from '@flighthq/geometry';

import { buildGlScale9Mapper } from './webglScale9Mapper';

describe('buildGlScale9Mapper', () => {
  it('returns null for invalid scale or bounds', () => {
    expect(buildGlScale9Mapper(createRectangle(0, 0, 0, 100), createRectangle(10, 10, 20, 20), 1, 1)).toBeNull();
    expect(buildGlScale9Mapper(createRectangle(0, 0, 100, 100), createRectangle(10, 10, 20, 20), 0, 1)).toBeNull();
  });

  it('maps edge and center coordinates using 9-slice scaling', () => {
    const mapper = buildGlScale9Mapper(createRectangle(0, 0, 100, 100), createRectangle(10, 10, 20, 20), 2, 3)!;

    expect(mapper.mapX(5)).toBe(5);
    expect(mapper.mapX(20)).toBe(70);
    expect(mapper.mapX(40)).toBe(140);
    expect(mapper.mapY(20)).toBe(120);
    expect(mapper.mapY(40)).toBe(240);
  });
});
