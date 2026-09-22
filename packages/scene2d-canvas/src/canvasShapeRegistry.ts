import { withKindMapEntry } from '@flighthq/registry/contract';
import { getRenderStateRuntime } from '@flighthq/render/contract';
import { registerShapeBoundsCommand } from '@flighthq/shape/contract';
import type { CanvasShapeCommand, RenderState, ShapeCommandKey } from '@flighthq/types/contract';

// The command set is per render state, like every other kind-keyed handler registry: the state a
// caller already holds is what carries the wiring, so `renderCanvasShapeCommands` can reach it from
// the top-level call rather than closing over a bag nothing above can inspect or add to. A GPU or DOM
// backend registers onto its own state and its ShapeRasterizer resolves through that same state.
//
// Returns null rather than undefined for an unregistered key — the ordinary "not wired" answer, not an
// error. Callers report the miss through the state's registryMiss seam.
export function getCanvasShapeCommand(state: RenderState, key: string): CanvasShapeCommand | null {
  const entry = getRenderStateRuntime(state).registries.canvasShapeCommands?.get(key);
  return entry ?? null;
}

export function registerCanvasShapeCommand<K extends ShapeCommandKey>(
  state: RenderState,
  command: CanvasShapeCommand<K>,
): void {
  registerShapeBoundsCommand(command);
  const runtime = getRenderStateRuntime(state);
  const table = runtime.registries.canvasShapeCommands ?? new Map();
  runtime.registries.canvasShapeCommands = withKindMapEntry(table, command.key, command);
}

export function registerCanvasShapeCommands(state: RenderState, commands: readonly CanvasShapeCommand[]): void {
  for (const command of commands) {
    registerCanvasShapeCommand(state, command);
  }
}
