export function createStatechartFloat32Array(length: number): Float32Array {
  return new Float32Array(length);
}

export function createStatechartFloat64Array(length: number): Float64Array {
  return new Float64Array(length);
}

export function createStatechartInt32Array(length: number, value: number): Int32Array {
  return new Int32Array(length).fill(value);
}
