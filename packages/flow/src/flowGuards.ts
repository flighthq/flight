// Generated from crates/flight-flow/src/flow_guards.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { logOnce } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';

import type { FlowGuardStateRef } from './flow.ts';
import type { FlowGuardKind } from './types.ts';

type FlowGuardLogData = FlowGuardLogRecord;

type FlowGuardLogLevel = 2;

interface FlowGuardLogRecord {
  kind: string;
}

function normalizeFlowGuardLogData(value: FlowGuardLogData): FlowGuardLogData {
  return value;
}

function normalizeFlowGuardLogLevel(value: FlowGuardLogLevel): FlowGuardLogLevel {
  return value;
}

export function disableFlowGuards(state: FlowGuardStateRef): void {
  let guardState = state!;
  guardState.enabled = false;
  guardState.context = null;
}

/**
 * Install the opt-in guards with the approved enable-time context: a caller-owned log state and a
 * live clock invoked at operation time.
 */
export function enableFlowGuards(state: FlowGuardStateRef, logState: LogState, clock: () => number): void {
  let guardState = state!;
  guardState.enabled = true;
  guardState.context = { logState: logState, clock: clock };
}

/**
 * The canonical TS string for a guard kind (D9e).
 */
export function getFlowGuardKindString(value: FlowGuardKind): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'duplicate-state-push':
        return 'duplicate-state-push';
      case 'transition-during-transition':
        return 'transition-during-transition';
    }
  })();
}

/**
 * Parses a guard kind string back to the enum (D9e); None for unknown names.
 */
export function parseFlowGuardKind(value: string): FlowGuardKind | null {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'duplicate-state-push':
        return 'duplicate-state-push';
      case 'transition-during-transition':
        return 'transition-during-transition';
      default:
        return null;
    }
  })();
}

/**
 * Reports a flow guard violation when enabled, with the exact TS key/channel/payload. The clock is
 * invoked at call time; no hidden state or frozen timestamp is involved.
 */
export function reportFlowGuard(state: Readonly<FlowGuardStateRef>, kind: FlowGuardKind): void {
  const [maybeContext, enabled] = (() => {
    const guardState = state!;
    return [guardState.context, guardState.enabled];
  })();
  if (!enabled) {
    return;
  }
  if (maybeContext === null) {
    return;
  }
  const activeContext = maybeContext!;
  const kindString = getFlowGuardKindString(kind);
  const key = `flow:${kindString}`;
  const data = normalizeFlowGuardLogData({ kind: String(kindString) });
  const level = normalizeFlowGuardLogLevel(2);
  logOnce(activeContext.logState, activeContext.clock(), key, level, data, 'flow');
}
