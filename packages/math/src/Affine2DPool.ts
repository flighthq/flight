import Affine2D from './Affine2D.js';

export default class Affine2DPool {
  private static pool: Affine2D[] = [];

  static clear(): void {
    this.pool.length = 0;
  }

  static get(): Affine2D {
    let m: Affine2D;

    if (this.pool.length > 0) {
      m = this.pool.pop() as Affine2D;
    } else {
      m = new Affine2D();
    }

    return m;
  }

  static getIdentity(): Affine2D {
    const m = this.get();
    Affine2D.identity(m);
    return m;
  }

  static release(m: Affine2D): void {
    if (!m) return;
    this.pool.push(m);
  }
}
