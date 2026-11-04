// Generated from crates/flight-textbidi/src/text_bidi_guards.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

const GUARD: { value: ((arg0: number) => void) | null } = { value: null };

export function reportTextBidiCompactTableMiss(codepoint: number): void {
  const guard = GUARD.value;
  if (guard !== null) {
    guard(codepoint);
  }
}

export function setTextBidiGuard(guard: ((arg0: number) => void) | null): void {
  GUARD.value = guard;
}
