import type { Rectangle } from '@flighthq/types';

import { create } from './rectangle.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Rectangle {
  let r: Rectangle;

  if (pool.length > 0) {
    r = pool.pop() as Rectangle;
  } else {
    r = create();
  }

  return r;
}

export function getEmpty(): Rectangle {
  const r = get();
  r.x = 0;
  r.y = 0;
  r.width = 0;
  r.height = 0;
  return r;
}

export function release(r: Rectangle): void {
  if (!r) return;
  pool.push(r);
}

const pool: Rectangle[] = [];
