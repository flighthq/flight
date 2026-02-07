import Vector3 from './Vector3.js';

export default class Vector3Pool {
  private static pool: Vector3[] = [];

  static clear(): void {
    this.pool.length = 0;
  }

  static get(): Vector3 {
    let v: Vector3;

    if (this.pool.length > 0) {
      v = this.pool.pop() as Vector3;
    } else {
      v = new Vector3();
    }

    return v;
  }

  static getEmpty(): Vector3 {
    const v = this.get();
    v.x = 0;
    v.y = 0;
    v.z = 0;
    return v;
  }

  static release(v: Vector3): void {
    if (!v) return;
    this.pool.push(v);
  }
}
