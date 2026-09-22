import { createMatrix4 } from '@flighthq/geometry/contract';

import {
  awdDataTypeByteSize,
  awdTransformToMatrix4,
  awdTransformToTransform3D,
  hasNonUnitScale,
  readAwdDataValue,
  readAwdProperties,
  readAwdPropertyFloat32,
  readAwdPropertyNumber,
  readAwdPropertyUint32,
  readAwdPropertyUint8,
  readAwdString,
  readAwdTransform,
  skipAwdAttrList,
} from './awd2Reader';
import {
  AWD2_DATA_FLOAT32,
  AWD2_DATA_FLOAT64,
  AWD2_DATA_INT16,
  AWD2_DATA_INT32,
  AWD2_DATA_INT8,
  AWD2_DATA_UINT16,
  AWD2_DATA_UINT32,
  AWD2_DATA_UINT8,
} from './awd2Schema';

describe('awdDataTypeByteSize', () => {
  it('sizes each AWD numeric type', () => {
    expect(awdDataTypeByteSize(AWD2_DATA_INT8)).toBe(1);
    expect(awdDataTypeByteSize(AWD2_DATA_UINT8)).toBe(1);
    expect(awdDataTypeByteSize(AWD2_DATA_INT16)).toBe(2);
    expect(awdDataTypeByteSize(AWD2_DATA_UINT16)).toBe(2);
    expect(awdDataTypeByteSize(AWD2_DATA_INT32)).toBe(4);
    expect(awdDataTypeByteSize(AWD2_DATA_UINT32)).toBe(4);
    expect(awdDataTypeByteSize(AWD2_DATA_FLOAT32)).toBe(4);
    expect(awdDataTypeByteSize(AWD2_DATA_FLOAT64)).toBe(8);
  });

  // A stream declaring a type this reader does not know still has to advance by SOMETHING, and float32 is
  // AWD's overwhelmingly common width — guessing it keeps one odd stream from desynchronizing the rest.
  it('falls back to four bytes for an unknown type', () => {
    expect(awdDataTypeByteSize(0xff)).toBe(4);
  });
});

describe('awdTransformToMatrix4', () => {
  // AWD writes twelve floats: three basis columns then the translation. The fourth column is implied, so
  // the writer has to supply it — a matrix left with a zero last row transforms every point to the origin.
  it('lays the twelve AWD components out as a 4x4 with a homogeneous last row', () => {
    const out = createMatrix4();
    awdTransformToMatrix4(out, new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 7, 8, 9]));
    expect(out.m[12]).toBeCloseTo(7);
    expect(out.m[13]).toBeCloseTo(8);
    expect(out.m[14]).toBeCloseTo(9);
    expect(out.m[15]).toBeCloseTo(1);
    expect([out.m[3], out.m[7], out.m[11]]).toEqual([0, 0, 0]);
  });

  it('overwrites an out matrix that already held another transform', () => {
    const out = createMatrix4();
    awdTransformToMatrix4(out, new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 7, 8, 9]));
    awdTransformToMatrix4(out, new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
    expect([out.m[12], out.m[13], out.m[14]]).toEqual([0, 0, 0]);
  });
});

describe('awdTransformToTransform3D', () => {
  it('decomposes a translation-only transform', () => {
    const transform = awdTransformToTransform3D(new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, 4]));
    expect(transform.position.x).toBeCloseTo(2);
    expect(transform.position.y).toBeCloseTo(3);
    // AWD is left-handed and Flight is right-handed, so the reader negates Z on the way in.
    expect(Math.abs(transform.position.z)).toBeCloseTo(4);
  });

  it('recovers a uniform scale', () => {
    const transform = awdTransformToTransform3D(new Float64Array([2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0]));
    expect(Math.abs(transform.scale.x)).toBeCloseTo(2);
    expect(Math.abs(transform.scale.y)).toBeCloseTo(2);
    expect(Math.abs(transform.scale.z)).toBeCloseTo(2);
  });
});

describe('hasNonUnitScale', () => {
  // The gate for emitting a scale animation channel at all, so the tolerance matters: the common
  // identity-scale skeleton must read as unit and keep its clips lean.
  it('is false at unit scale and true once any axis departs from it', () => {
    expect(hasNonUnitScale(1, 1, 1)).toBe(false);
    expect(hasNonUnitScale(3, 1, 1)).toBe(true);
    expect(hasNonUnitScale(1, 3, 1)).toBe(true);
    expect(hasNonUnitScale(1, 1, 3)).toBe(true);
  });

  it('treats a decompose rounding wobble as unit', () => {
    expect(hasNonUnitScale(1 + 1e-6, 1 - 1e-6, 1)).toBe(false);
    expect(hasNonUnitScale(1.001, 1, 1)).toBe(true);
  });
});

describe('readAwdDataValue', () => {
  it('reads each type at its own width and signedness', () => {
    const view = new DataView(new ArrayBuffer(8));
    view.setInt8(0, -5);
    expect(readAwdDataValue(view, 0, AWD2_DATA_INT8)).toBe(-5);
    view.setInt16(0, -300, true);
    expect(readAwdDataValue(view, 0, AWD2_DATA_INT16)).toBe(-300);
    view.setUint32(0, 4_000_000_000, true);
    expect(readAwdDataValue(view, 0, AWD2_DATA_UINT32)).toBe(4_000_000_000);
    view.setFloat64(0, 1.5, true);
    expect(readAwdDataValue(view, 0, AWD2_DATA_FLOAT64)).toBeCloseTo(1.5);
  });
});

describe('readAwdProperties', () => {
  it('returns each key value span and steps over the ones it was not asked about', () => {
    // Two records: key 1 holding a float32, key 2 holding a uint32.
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    view.setUint32(0, 20, true);
    view.setUint16(4, 1, true);
    view.setUint32(6, 4, true);
    view.setFloat32(10, 2.5, true);
    view.setUint16(14, 2, true);
    view.setUint32(16, 4, true);
    view.setUint32(20, 77, true);
    const { end, values } = readAwdProperties(view, 0, 32);
    expect(end).toBe(24);
    expect([...values.keys()].sort()).toEqual([1, 2]);
    expect(readAwdPropertyFloat32(view, values, 1)).toBeCloseTo(2.5);
    expect(readAwdPropertyUint32(view, values, 2)).toBe(77);
  });

  it('returns an empty list when the record cannot hold its own length prefix', () => {
    const view = new DataView(new ArrayBuffer(8));
    const { end, values } = readAwdProperties(view, 6, 8);
    expect(values.size).toBe(0);
    expect(end).toBe(6);
  });
});

describe('readAwdPropertyFloat32', () => {
  it('returns the sentinel for an absent or too-short key', () => {
    const view = new DataView(new ArrayBuffer(8));
    expect(readAwdPropertyFloat32(view, new Map(), 1)).toBeNull();
    expect(readAwdPropertyFloat32(view, new Map([[1, { length: 2, offset: 0 }]]), 1)).toBeNull();
  });
});

describe('readAwdPropertyNumber', () => {
  // AWD carries a global "wide properties" flag, but each record is byte-length prefixed, so the width is
  // self-describing. Reading the record rather than the flag keeps a flag-disagreeing file readable,
  // which a flag-driven reader would silently misparse into garbage magnitudes.
  it('reads the width the record declares rather than a file-level flag', () => {
    const view = new DataView(new ArrayBuffer(16));
    view.setFloat32(0, 1.25, true);
    view.setFloat64(8, 9.5, true);
    expect(readAwdPropertyNumber(view, new Map([[1, { length: 4, offset: 0 }]]), 1)).toBeCloseTo(1.25);
    expect(readAwdPropertyNumber(view, new Map([[1, { length: 8, offset: 8 }]]), 1)).toBeCloseTo(9.5);
  });

  it('returns the sentinel for an absent key', () => {
    expect(readAwdPropertyNumber(new DataView(new ArrayBuffer(8)), new Map(), 9)).toBeNull();
  });
});

describe('readAwdPropertyUint32', () => {
  it('reads a full unsigned range', () => {
    const view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, 4_294_967_295, true);
    expect(readAwdPropertyUint32(view, new Map([[1, { length: 4, offset: 0 }]]), 1)).toBe(4_294_967_295);
  });
});

describe('readAwdPropertyUint8', () => {
  it('reads a single byte and refuses an empty field', () => {
    const view = new DataView(new ArrayBuffer(4));
    view.setUint8(0, 200);
    expect(readAwdPropertyUint8(view, new Map([[1, { length: 1, offset: 0 }]]), 1)).toBe(200);
    expect(readAwdPropertyUint8(view, new Map([[1, { length: 0, offset: 0 }]]), 1)).toBeNull();
  });
});

describe('readAwdString', () => {
  it('reads a length-prefixed UTF-8 string and reports where it ended', () => {
    const text = new TextEncoder().encode('Root');
    const bytes = new Uint8Array(2 + text.length);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, text.length, true);
    bytes.set(text, 2);
    expect(readAwdString(view, bytes, 0)).toEqual({ end: 6, value: 'Root' });
  });

  it('reads an empty name as an empty string', () => {
    const bytes = new Uint8Array(2);
    expect(readAwdString(new DataView(bytes.buffer), bytes, 0)).toEqual({ end: 2, value: '' });
  });
});

describe('readAwdTransform', () => {
  it('reads twelve 32-bit components and reports the end', () => {
    const bytes = new Uint8Array(48);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < 12; i++) view.setFloat32(i * 4, i, true);
    expect(readAwdTransform(view, 0, false).end).toBe(48);
  });

  it('reads twelve 64-bit components when the block declares wide precision', () => {
    const bytes = new Uint8Array(96);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < 12; i++) view.setFloat64(i * 8, i, true);
    expect(readAwdTransform(view, 0, true).end).toBe(96);
  });
});

describe('skipAwdAttrList', () => {
  it('advances past the list by its declared byte length', () => {
    const view = new DataView(new ArrayBuffer(16));
    view.setUint32(0, 6, true);
    expect(skipAwdAttrList(view, 0, 16)).toBe(10);
  });

  it('stays put when the list cannot hold its own length prefix', () => {
    expect(skipAwdAttrList(new DataView(new ArrayBuffer(8)), 6, 8)).toBe(6);
  });
});
