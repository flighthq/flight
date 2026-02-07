import Matrix4 from './Matrix4.js';

export default class Matrix4Pool {
  private static pool: Matrix4[] = [];

  static clear(): void {
    this.pool.length = 0;
  }

  static get(): Matrix4 {
    let m: Matrix4;

    if (this.pool.length > 0) {
      m = this.pool.pop() as Matrix4;
    } else {
      m = new Matrix4();
    }

    return m;
  }

  static getIdentity(): Matrix4 {
    const m = this.get();
    Matrix4.identity(m);
    return m;
  }

  static release(m: Matrix4): void {
    if (!m) return;
    this.pool.push(m);
  }
}
