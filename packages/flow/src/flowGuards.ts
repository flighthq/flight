import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

export function disableFlowGuards(): void {
  enabled = false;
}

export function enableFlowGuards(): void {
  enabled = true;
}

function reportFlowGuard(kind: 'duplicate-state-push' | 'transition-during-transition'): void {
  if (!enabled) return;
  logOnce(`flow:${kind}`, LogLevel.Warn, { kind }, 'flow');
}

let enabled = false;

export { reportFlowGuard };
