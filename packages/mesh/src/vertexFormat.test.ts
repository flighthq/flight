import { describe, expect, it } from 'vitest';

import {
  getVertexFormatByteLength,
  getVertexFormatComponentCount,
  readVertexFormatComponent,
  writeVertexFormatComponent,
} from './vertexFormat';

describe('getVertexFormatByteLength', () => {
  it('reports packed and float sizes', () => {
    expect(getVertexFormatByteLength('float32x3')).toBe(12);
    expect(getVertexFormatByteLength('unorm8x4')).toBe(4);
  });
});

describe('getVertexFormatComponentCount', () => {
  it('reports component counts', () => {
    expect(getVertexFormatComponentCount('uint16x4')).toBe(4);
  });
});

describe('readVertexFormatComponent', () => {
  it('reads a float component', () => {
    const bytes = new ArrayBuffer(16);
    const view = new DataView(bytes);
    writeVertexFormatComponent(view, 0, 'float32x2', 0, 2.5);
    expect(readVertexFormatComponent(view, 0, 'float32x2', 0)).toBe(2.5);
  });
});

describe('writeVertexFormatComponent', () => {
  it('writes a float component', () => {
    const view = new DataView(new ArrayBuffer(16));
    writeVertexFormatComponent(view, 0, 'float32x2', 0, 2.5);
    expect(view.getFloat32(0, true)).toBe(2.5);
  });
});
