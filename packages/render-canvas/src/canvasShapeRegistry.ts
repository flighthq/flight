import type { CanvasShapeCommand, ShapeCommandKey } from '@flighthq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, CanvasShapeCommand<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCanvasShapeCommand(key: string): CanvasShapeCommand<any> | undefined {
  return registry.get(key);
}

export function registerCanvasShapeCommand<K extends ShapeCommandKey>(command: CanvasShapeCommand<K>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registry.set(command.key, command as CanvasShapeCommand<any>);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCanvasShapeCommands(commands: CanvasShapeCommand<any>[]): void {
  for (const command of commands) {
    registerCanvasShapeCommand(command);
  }
}
