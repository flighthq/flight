import type { CanvasShapeCommandMap, CanvasShapeDrawState, CanvasShapeHandler, ShapeCommandKey } from '@flighthq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCanvasShapeHandler = (ctx: CanvasRenderingContext2D, state: CanvasShapeDrawState, ...args: any[]) => void;

const registry = new Map<string, AnyCanvasShapeHandler>();

export function registerCanvasShapeCommand<K extends ShapeCommandKey>(key: K, handler: CanvasShapeHandler<K>): void {
  registry.set(key, handler as AnyCanvasShapeHandler);
}

export function registerCanvasShapeCommands(commands: CanvasShapeCommandMap): void {
  for (const key of Object.keys(commands) as ShapeCommandKey[]) {
    const handler = commands[key];
    if (handler !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerCanvasShapeCommand(key, handler as any);
    }
  }
}

export function getCanvasShapeRenderer(key: string): AnyCanvasShapeHandler | undefined {
  return registry.get(key);
}
