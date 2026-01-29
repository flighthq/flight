import Matrix2D from './Matrix2D.js';

export default class Matrix2DPool {
  private static pool: Matrix2D[] = [];

  static clear(): void {
    this.pool.length = 0;
  }

  static get(): Matrix2D {
    let m: Matrix2D;

    if (this.pool.length > 0) {
      m = this.pool.pop() as Matrix2D;
    } else {
      m = new Matrix2D();
    }

    return m;
  }

  static getIdentity(): Matrix2D {
    const m = this.get();
    m.a = 1;
    m.b = 0;
    m.c = 0;
    m.d = 1;
    m.tx = 0;
    m.ty = 0;
    return m;
  }

  static release(m: Matrix2D): void {
    if (!m) return;
    this.pool.push(m);
  }
}
