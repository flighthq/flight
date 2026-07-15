import { skinVertices } from './skinVertices';

// A column-major 4x4 identity, then variants with translation/scale, laid out as the 16-float palette entry.
function identity(): number[] {
  // prettier-ignore
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function translation(tx: number, ty: number, tz: number): number[] {
  const m = identity();
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  return m;
}

describe('skinVertices', () => {
  it('passes vertices through unchanged when the only weighted joint is identity', () => {
    const positions = new Float32Array([2, 3, 4]);
    const normals = new Float32Array([0, 1, 0]);
    const joints = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0]);
    const palette = new Float32Array(identity());
    const outPositions = new Float32Array(3);
    const outNormals = new Float32Array(3);

    skinVertices(outPositions, outNormals, positions, normals, joints, weights, palette);

    expect(Array.from(outPositions)).toEqual([2, 3, 4]);
    expect(Array.from(outNormals)).toEqual([0, 1, 0]);
  });

  it('applies a single-joint translation to the position but not the normal', () => {
    const positions = new Float32Array([1, 0, 0]);
    const normals = new Float32Array([0, 0, 1]);
    const joints = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0]);
    const palette = new Float32Array(translation(10, 20, 30));
    const outPositions = new Float32Array(3);
    const outNormals = new Float32Array(3);

    skinVertices(outPositions, outNormals, positions, normals, joints, weights, palette);

    expect(outPositions[0]).toBeCloseTo(11);
    expect(outPositions[1]).toBeCloseTo(20);
    expect(outPositions[2]).toBeCloseTo(30);
    // Normals ignore the translation column.
    expect(outPositions).not.toBe(outNormals);
    expect(outNormals[0]).toBeCloseTo(0);
    expect(outNormals[1]).toBeCloseTo(0);
    expect(outNormals[2]).toBeCloseTo(1);
  });

  it('blends two joints by their weights', () => {
    const positions = new Float32Array([0, 0, 0]);
    const normals = new Float32Array([0, 0, 0]);
    // Joint 0 at palette base 0 translates +(10,0,0); joint 1 at base 16 translates +(0,10,0).
    const palette = new Float32Array([...translation(10, 0, 0), ...translation(0, 10, 0)]);
    const joints = new Uint16Array([0, 1, 0, 0]);
    const weights = new Float32Array([0.25, 0.75, 0, 0]);
    const outPositions = new Float32Array(3);
    const outNormals = new Float32Array(3);

    skinVertices(outPositions, outNormals, positions, normals, joints, weights, palette);

    // 0.25 * (10,0,0) + 0.75 * (0,10,0) = (2.5, 7.5, 0)
    expect(outPositions[0]).toBeCloseTo(2.5);
    expect(outPositions[1]).toBeCloseTo(7.5);
    expect(outPositions[2]).toBeCloseTo(0);
  });

  it('skins every vertex in a multi-vertex buffer', () => {
    const positions = new Float32Array([1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1]);
    const joints = new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
    const palette = new Float32Array(translation(5, 0, 0));
    const outPositions = new Float32Array(6);
    const outNormals = new Float32Array(6);

    skinVertices(outPositions, outNormals, positions, normals, joints, weights, palette);

    expect(Array.from(outPositions)).toEqual([6, 0, 0, 5, 1, 0]);
  });

  it('is safe when out aliases the input positions', () => {
    const positions = new Float32Array([1, 2, 3]);
    const normals = new Float32Array([1, 0, 0]);
    const joints = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0]);
    const palette = new Float32Array(translation(1, 1, 1));

    skinVertices(positions, normals, positions, normals, joints, weights, palette);

    expect(Array.from(positions)).toEqual([2, 3, 4]);
  });
});
