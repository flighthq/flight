export interface Runtime {
  binding: object | null;
}

export const RuntimeKey: unique symbol = Symbol.for('Runtime');
