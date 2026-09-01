import type { ShapeBoundsCommand, ShapeCommandKey } from '@flighthq/types/contract';

export function clearShapeBoundsCommands(): void {
  _commands.clear();
  _revision++;
}

export function getShapeBoundsCommand(key: string): Readonly<ShapeBoundsCommand> | null {
  return _commands.get(key) ?? null;
}

export function getShapeBoundsCommandRegistryRevision(): number {
  return _revision;
}

export function registerShapeBoundsCommand<K extends ShapeCommandKey>(command: ShapeBoundsCommand<K>): void {
  const previous = _commands.get(command.key);
  _commands.set(command.key, command);
  if (previous?.fillBounds === command.fillBounds && previous.strokeBounds === command.strokeBounds) return;
  _revision++;
}

export function unregisterShapeBoundsCommand(key: string): void {
  if (!_commands.delete(key)) return;
  _revision++;
}

// Backend-neutral geometry is process policy rather than render-state policy: bounds are pulled by the
// scene graph before a renderer or state need exist. The registry starts empty and only explicit
// register* calls populate it; binding the same callbacks again is not a semantic change.
const _commands = new Map<string, Readonly<ShapeBoundsCommand>>();
let _revision = 0;
