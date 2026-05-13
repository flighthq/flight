import { reserveFloat32Array, reserveInt16Array, reserveUint16Array } from './typedarray';

describe('reserveFloat32Array', () => {
  it('returns the same array if the capacity is equal', () => {
    const array = new Float32Array(100);
    const out = reserveFloat32Array(array, 100);
    expect(out).toStrictEqual(array);
  });

  it('returns the same array if the capacity is less than existing length', () => {
    const array = new Float32Array(100);
    const out = reserveFloat32Array(array, 10);
    expect(out).toStrictEqual(array);
    expect(out.length).toBe(100);
  });

  it('allocates a new array if the capacity is larger', () => {
    const array = new Float32Array(100);
    const out = reserveFloat32Array(array, 1000);
    expect(out).not.toStrictEqual(array);
    expect(out.length).toBe(1000);
  });

  it('copies the existing array values if it allocates', () => {
    const array = new Float32Array(10);
    for (let i = 0; i < 10; i++) {
      array[i] = i;
    }
    const out = reserveFloat32Array(array, 100);
    for (let i = 0; i < 10; i++) {
      expect(out[i]).toBe(array[i]);
    }
  });
});

describe('reserveInt16Array', () => {
  it('returns the same array if the capacity is equal', () => {
    const array = new Int16Array(100);
    const out = reserveInt16Array(array, 100);
    expect(out).toStrictEqual(array);
  });

  it('returns the same array if the capacity is less than existing length', () => {
    const array = new Int16Array(100);
    const out = reserveInt16Array(array, 10);
    expect(out).toStrictEqual(array);
    expect(out.length).toBe(100);
  });

  it('allocates a new array if the capacity is larger', () => {
    const array = new Int16Array(100);
    const out = reserveInt16Array(array, 1000);
    expect(out).not.toStrictEqual(array);
    expect(out.length).toBe(1000);
  });

  it('copies the existing array values if it allocates', () => {
    const array = new Int16Array(10);
    for (let i = 0; i < 10; i++) {
      array[i] = i;
    }
    const out = reserveInt16Array(array, 100);
    for (let i = 0; i < 10; i++) {
      expect(out[i]).toBe(array[i]);
    }
  });
});

describe('reserveInt16Array', () => {
  it('returns the same array if the capacity is equal', () => {
    const array = new Uint16Array(100);
    const out = reserveUint16Array(array, 100);
    expect(out).toStrictEqual(array);
  });

  it('returns the same array if the capacity is less than existing length', () => {
    const array = new Uint16Array(100);
    const out = reserveUint16Array(array, 10);
    expect(out).toStrictEqual(array);
    expect(out.length).toBe(100);
  });

  it('allocates a new array if the capacity is larger', () => {
    const array = new Uint16Array(100);
    const out = reserveUint16Array(array, 1000);
    expect(out).not.toStrictEqual(array);
    expect(out.length).toBe(1000);
  });

  it('copies the existing array values if it allocates', () => {
    const array = new Uint16Array(10);
    for (let i = 0; i < 10; i++) {
      array[i] = i;
    }
    const out = reserveUint16Array(array, 100);
    for (let i = 0; i < 10; i++) {
      expect(out[i]).toBe(array[i]);
    }
  });
});
