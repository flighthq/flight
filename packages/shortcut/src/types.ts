import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

interface ShortcutEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

// A keyboard accelerator (chord) in its canonical normalized string form, e.g. 'Control+Shift+K'.
// Modifiers appear in canonical order (Control < Alt < Shift < Meta < Super < CommandOrControl)
// joined to the key with '+'. CommandOrControl sorts last so a chord carrying both it and a concrete
// Control has one input-independent form.
export type Accelerator = string;

// The reason an accelerator string failed to parse, returned by parseAcceleratorDetailed for
// diagnostics and validation UIs. The common parse path returns null instead.
export interface AcceleratorParseError {
  // The offending token, or '' when the failure is not tied to a specific token (e.g. 'empty').
  token: string;
  reason: AcceleratorParseErrorReason;
}

export type AcceleratorParseErrorReason =
  | 'duplicate-modifier'
  | 'empty'
  | 'missing-key'
  | 'unknown-key'
  | 'unknown-modifier';

// A modifier key in an accelerator chord. 'CommandOrControl' is a platform-relative alias that
// resolves to 'Meta' on macOS and 'Control' on Windows/Linux.
export type ShortcutModifier = 'Alt' | 'CommandOrControl' | 'Control' | 'Meta' | 'Shift' | 'Super';

// The canonical key token of an accelerator chord — the non-modifier half of 'Control+Shift+K'.
// These are the names normalizeAccelerator emits; the many accepted input spellings (case variants,
// 'esc', 'pgdn', 'num0', a bare '/') all resolve to one of these. Names follow the physical-key
// vocabulary (BracketLeft, Backquote, Minus) rather than the shifted glyph a layout produces, so a
// chord means the same key on every keyboard layout.
//
// The set is bounded by what a native global-hotkey host can actually register — it tracks Electron's
// documented accelerator key codes. A key outside this union is not a Flight limitation to lift
// locally: it is a key no backend would accept.
export type ShortcutKeyName =
  | ShortcutDigitKeyName
  | ShortcutEditingKeyName
  | ShortcutFunctionKeyName
  | ShortcutLetterKeyName
  | ShortcutLockKeyName
  | ShortcutMediaKeyName
  | ShortcutNavigationKeyName
  | ShortcutNumpadKeyName
  | ShortcutPunctuationKeyName;

export type ShortcutDigitKeyName = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type ShortcutEditingKeyName = 'Backspace' | 'Delete' | 'Escape' | 'Insert' | 'Return' | 'Space' | 'Tab';

export type ShortcutFunctionKeyName =
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12'
  | 'F13'
  | 'F14'
  | 'F15'
  | 'F16'
  | 'F17'
  | 'F18'
  | 'F19'
  | 'F20'
  | 'F21'
  | 'F22'
  | 'F23'
  | 'F24';

export type ShortcutLetterKeyName =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z';

export type ShortcutLockKeyName = 'CapsLock' | 'NumLock' | 'PrintScreen' | 'ScrollLock';

export type ShortcutMediaKeyName =
  | 'MediaNextTrack'
  | 'MediaPlayPause'
  | 'MediaPreviousTrack'
  | 'MediaStop'
  | 'VolumeDown'
  | 'VolumeMute'
  | 'VolumeUp';

export type ShortcutNavigationKeyName =
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'End'
  | 'Home'
  | 'PageDown'
  | 'PageUp';

export type ShortcutNumpadKeyName =
  | 'Numpad0'
  | 'Numpad1'
  | 'Numpad2'
  | 'Numpad3'
  | 'Numpad4'
  | 'Numpad5'
  | 'Numpad6'
  | 'Numpad7'
  | 'Numpad8'
  | 'Numpad9'
  | 'NumpadAdd'
  | 'NumpadDecimal'
  | 'NumpadDivide'
  | 'NumpadEnter'
  | 'NumpadMultiply'
  | 'NumpadSubtract';

export type ShortcutPunctuationKeyName =
  | 'Backquote'
  | 'Backslash'
  | 'BracketLeft'
  | 'BracketRight'
  | 'Comma'
  | 'Equal'
  | 'Minus'
  | 'Period'
  | 'Plus'
  | 'Quote'
  | 'Semicolon'
  | 'Slash';

// The decomposed form of an accelerator: its canonical key token plus its modifiers in canonical
// order. Written into by parseAccelerator as an `out` argument (allocate with makeParsedAccelerator).
//
// `key` is '' only in the zero value a fresh makeParsedAccelerator() returns — a successful parse
// always writes a real ShortcutKeyName, and a failed parse leaves `out` untouched, so '' means
// "never parsed into" rather than "parsed to nothing".
//
// `modifiers` is filled in place: parseAccelerator clears and refills the array the caller allocated
// rather than replacing it, so a reference held to `parsed.modifiers` stays live across parses.
export interface ParsedAccelerator {
  key: ShortcutKeyName | '';
  modifiers: ShortcutModifier[];
}

// One caller-owned global-hotkey registration. The normalized accelerator is durable value data; the
// signal, native subscription token, provider origin, and attachment state are runtime-only.
export interface GlobalShortcut extends ShortcutEntity {
  readonly accelerator: Accelerator;
  readonly onTrigger: Signal<void>;
}

// Opaque handle returned by the native trigger provider after registration succeeds. Providers keep
// their native accelerator/callback identity out of band and accept only the exact token at teardown.
export interface ShortcutTriggerSubscription extends ShortcutEntity {}

export type CreateGlobalShortcutOutcome =
  | Readonly<{ reason: 'created'; shortcut: GlobalShortcut }>
  | Readonly<{ parseError: AcceleratorParseError; reason: 'unparseable' }>;

export type GlobalShortcutAttachOutcome = Readonly<{
  reason:
    | 'already-attached'
    | 'already-registered'
    | 'attached'
    | 'native-refused'
    | 'registration-in-progress'
    | 'trigger-provider-failed';
}>;

export type GlobalShortcutDetachOutcome = Readonly<{
  reason: 'detached' | 'not-attached' | 'trigger-provider-failed';
}>;

export type GlobalShortcutQueryOutcome =
  | Readonly<{ reason: 'not-registered' | 'query-provider-failed' | 'registered' }>
  | Readonly<{ parseError: AcceleratorParseError; reason: 'unparseable' }>;

export type ShortcutTriggerSubscribeOutcome =
  | Readonly<{ reason: 'refused' }>
  | Readonly<{ reason: 'subscribed'; subscription: ShortcutTriggerSubscription }>;

export interface ShortcutTriggerUnsubscribeOutcome {
  readonly reason: 'unknown-subscription' | 'unsubscribed';
}

// Native registration is the trigger event subscription. It is awaited uniformly: Electron lifts its
// synchronous boolean into this shape, while Tauri awaits the plugin Promise. destroy owns any native
// registrations whose exact tokens have not yet been successfully unsubscribed.
export interface HostShortcutTriggerCapability {
  destroy(): Promise<void>;
  subscribe(accelerator: Accelerator, trigger: () => void): Promise<ShortcutTriggerSubscribeOutcome>;
  unsubscribe(subscription: ShortcutTriggerSubscription): Promise<ShortcutTriggerUnsubscribeOutcome>;
}

// Kept separate from trigger despite identical E/T coverage because a query is a command/result shape,
// not an event subscription. Provider absence is represented only by an omitted Host slot.
export interface HostShortcutQueryCapability {
  isRegistered(accelerator: Accelerator): Promise<boolean>;
}

export interface HostShortcutCapabilities {
  readonly query?: HostShortcutQueryCapability;
  readonly trigger?: HostShortcutTriggerCapability;
}
