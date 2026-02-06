import Matrix3 from './Matrix3.js';

export default class Matrix3Pool {
  private static pool: Matrix3[] = [];

  static clear(): void {
    this.pool.length = 0;
  }

  static get(): Matrix3 {
    let m: Matrix3;

    if (this.pool.length > 0) {
      m = this.pool.pop() as Matrix3;
    } else {
      m = new Matrix3();
    }

    return m;
  }

  static getIdentity(): Matrix3 {
    const m = this.get();
    Matrix3.identity(m);
    return m;
  }

  static release(m: Matrix3): void {
    if (!m) return;
    this.pool.push(m);
  }
}
