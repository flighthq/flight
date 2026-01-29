import Rectangle from './Rectangle.js';

export default class RectanglePool {
  private static pool: Rectangle[] = [];

  static clear(): void {
    this.pool.length = 0;
  }

  static get(): Rectangle {
    let r: Rectangle;

    if (this.pool.length > 0) {
      r = this.pool.pop() as Rectangle;
    } else {
      r = new Rectangle();
    }

    return r;
  }

  static getEmpty(): Rectangle {
    const r = this.get();
    r.x = 0;
    r.y = 0;
    r.width = 0;
    r.height = 0;
    return r;
  }

  static release(r: Rectangle): void {
    if (!r) return;
    this.pool.push(r);
  }
}
