import type { FlowGuardStateRef } from './flow.ts';

// TypeScript's narrow unwind adapter for Rust's `Drop` transition guard. The portable state-stack
// behavior is generated in flow.ts; only the target's cleanup construct lives here.
export function runFlowTransition(guards: Readonly<FlowGuardStateRef>, operation: (depth: number) => void): void {
  const mutableGuards = guards as FlowGuardStateRef;
  const depth = mutableGuards.transitionDepth;
  mutableGuards.transitionDepth += 1;
  try {
    operation(depth);
  } finally {
    mutableGuards.transitionDepth -= 1;
  }
}
