export function reserveFloat32Array(array: Float32Array, capacity: number): Float32Array {
  if (array.length >= capacity) return array;
  const out = new Float32Array(capacity);
  if (array) out.set(array);
  return out;
}

export function reserveInt16Array(array: Int16Array, capacity: number): Int16Array {
  if (array.length >= capacity) return array;
  const out = new Int16Array(capacity);
  if (array) out.set(array);
  return out;
}

export function reserveUint16Array(array: Uint16Array, capacity: number): Uint16Array {
  if (array.length >= capacity) return array;
  const out = new Uint16Array(capacity);
  if (array) out.set(array);
  return out;
}
