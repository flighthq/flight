import type { LayoutResolutionGuard, LayoutState } from '@flighthq/types/contract';

// Opts a state into caller-facing warnings without choosing a logging system for the caller. Passing a
// sink keeps this types-only package portable; an application can adapt it to @flighthq/log or its host.
export function enableLayoutGuards(state: LayoutState, warningSink: LayoutResolutionGuard): void {
  state.guard = warningSink;
}
