export interface Runtime {
  api: object | null;
}

export const RuntimeKey: unique symbol = Symbol.for('Runtime');
