import type { TextMarkupGuard, TextMarkupIssue } from './types.ts';

export function reportTextMarkupIssue(issue: Readonly<TextMarkupIssue>): void {
  _guard?.(issue);
}

export function setTextMarkupGuard(guard: TextMarkupGuard | null): void {
  _guard = guard;
}

let _guard: TextMarkupGuard | null = null;
