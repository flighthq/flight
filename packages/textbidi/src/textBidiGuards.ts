import type { TextBidiGuard } from '@flighthq/types/contract';

export function reportTextBidiCompactTableMiss(codepoint: number): void {
  _guard?.(codepoint);
}

export function setTextBidiGuard(guard: TextBidiGuard | null): void {
  _guard = guard;
}

let _guard: TextBidiGuard | null = null;
