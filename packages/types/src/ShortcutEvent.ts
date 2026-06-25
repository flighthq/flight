// The payload delivered when a registered global shortcut fires. Carries the normalized accelerator
// string that triggered it.
export interface ShortcutEvent {
  accelerator: string;
}
