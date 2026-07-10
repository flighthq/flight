import type { FlowStack } from '@flighthq/types';

// Allocate an empty flow-state stack. The only allocating function; every other stack function reads
// or mutates an existing stack in place. Push states onto it to drive the enter/pause lifecycle.
export function createFlowStack(): FlowStack {
  return { states: [] };
}
