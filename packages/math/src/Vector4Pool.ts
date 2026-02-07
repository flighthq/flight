import Vector4 from './Vector4.js';

export default class Vector4Pool {
  private static pool: Vector4[] = [];

  static clear(): void {
    this.pool.length = 0;
  }

  static get(): Vector4 {
    let v: Vector4;

    if (this.pool.length > 0) {
      v = this.pool.pop() as Vector4;
    } else {
      v = new Vector4();
    }

    return v;
  }

  static getEmpty(): Vector4 {
    const v = this.get();
    v.x = 0;
    v.y = 0;
    v.z = 0;
    v.w = 0;
    return v;
  }

  static release(v: Vector4): void {
    if (!v) return;
    this.pool.push(v);
  }
}
