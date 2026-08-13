import type { VertexFormat } from '@flighthq/types/contract';

export function getVertexFormatByteLength(format: VertexFormat): number {
  switch (format) {
    case 'float32x2':
      return 8;
    case 'float32x3':
      return 12;
    case 'float32x4':
      return 16;
    case 'uint16x4':
      return 8;
    case 'uint8x4':
    case 'unorm8x4':
      return 4;
  }
}

export function getVertexFormatComponentCount(format: VertexFormat): number {
  switch (format) {
    case 'float32x2':
      return 2;
    case 'float32x3':
      return 3;
    case 'float32x4':
    case 'uint16x4':
    case 'uint8x4':
    case 'unorm8x4':
      return 4;
  }
}

export function readVertexFormatComponent(
  view: Readonly<DataView>,
  byteOffset: number,
  format: VertexFormat,
  component: number,
): number {
  switch (format) {
    case 'float32x2':
    case 'float32x3':
    case 'float32x4':
      return view.getFloat32(byteOffset + component * 4, true);
    case 'uint16x4':
      return view.getUint16(byteOffset + component * 2, true);
    case 'uint8x4':
      return view.getUint8(byteOffset + component);
    case 'unorm8x4':
      return view.getUint8(byteOffset + component) / 255;
  }
}

export function writeVertexFormatComponent(
  view: DataView,
  byteOffset: number,
  format: VertexFormat,
  component: number,
  value: number,
): void {
  switch (format) {
    case 'float32x2':
    case 'float32x3':
    case 'float32x4':
      view.setFloat32(byteOffset + component * 4, value, true);
      return;
    case 'uint16x4':
      view.setUint16(byteOffset + component * 2, Math.round(Math.min(0xffff, Math.max(0, value))), true);
      return;
    case 'uint8x4':
      view.setUint8(byteOffset + component, Math.round(Math.min(0xff, Math.max(0, value))));
      return;
    case 'unorm8x4':
      view.setUint8(byteOffset + component, Math.round(Math.min(1, Math.max(0, value)) * 255));
      return;
  }
}
