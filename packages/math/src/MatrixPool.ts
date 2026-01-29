import Matrix from './Matrix.js';

export default class MatrixPool {
  private static pool: Matrix[] = [];

  static clear(): void {
    this.pool.length = 0;
  }

  static get(): Matrix {
    let m: Matrix;

    if (this.pool.length > 0) {
      m = this.pool.pop() as Matrix;
    } else {
      m = new Matrix();
    }

    return m;
  }

  static getIdentity(): Matrix {
    const m = this.get();
    m.a = 1;
    m.b = 0;
    m.c = 0;
    m.d = 1;
    m.tx = 0;
    m.ty = 0;
    return m;
  }

  static release(m: Matrix): void {
    if (!m) return;
    this.pool.push(m);
  }
}
