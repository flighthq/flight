import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  Accelerator,
  AcceleratorParseError,
  ParsedAccelerator,
  ShortcutBackend,
  ShortcutEvent,
  ShortcutModifier,
  ShortcutSignals,
} from '@flighthq/types';

// True when two accelerator strings (in any accepted spelling) represent the same chord.
// Returns false when either is unparseable.
export function areAcceleratorsEqual(a: string, b: string): boolean {
  const na = normalizeAccelerator(a);
  const nb = normalizeAccelerator(b);
  if (na === null || nb === null) return false;
  return na === nb;
}

// Allocates a zeroed ParsedAccelerator for use as an `out` argument to parseAccelerator.
export function createParsedAccelerator(): ParsedAccelerator {
  return { key: '', modifiers: [] };
}

// Builds the default web backend. Web pages cannot register OS-level global hotkeys; every
// operation returns a sentinel — register / unregister / isRegistered / setEnabled are false,
// getRegistered returns [], and unregisterAll / setAllEnabled are no-ops.
export function createWebShortcutBackend(): ShortcutBackend {
  return {
    getRegistered() {
      return _emptyList;
    },
    isRegistered() {
      return false;
    },
    register() {
      return false;
    },
    setAllEnabled() {
      // No-op: web has no global-hotkey registry.
    },
    setEnabled() {
      return false;
    },
    unregister() {
      return false;
    },
    unregisterAll() {
      // No-op: web has no global-hotkey registry to clear.
    },
  };
}

// Disables a registered global shortcut without unregistering it; the handler is preserved and
// can be re-enabled later. Returns false when not registered or unsupported.
export function disableGlobalShortcut(accelerator: string): boolean {
  const normalized = normalizeAccelerator(accelerator);
  if (normalized === null) return false;
  return getShortcutBackend().setEnabled(normalized, false);
}

// Re-enables a previously disabled global shortcut. Returns false when not registered or unsupported.
export function enableGlobalShortcut(accelerator: string): boolean {
  const normalized = normalizeAccelerator(accelerator);
  if (normalized === null) return false;
  return getShortcutBackend().setEnabled(normalized, true);
}

// Opts in to the global shortcut signal group. Returns a ShortcutSignals object (stable — the same
// object is returned on repeated calls). The `onTrigger` signal is fired for every global shortcut
// trigger, with the ShortcutEvent payload. Requires a prior call to registerGlobalShortcut to fire.
// Handlers registered with registerGlobalShortcut are always called first; the signal fires after.
export function enableGlobalShortcutSignals(): ShortcutSignals {
  if (_signals !== null) return _signals;
  _signals = { onTrigger: createSignal() };
  return _signals;
}

// Formats an accelerator string for human-readable display per the current OS:
//   macOS:       ⌘⇧K  (symbols, no separator)
//   Windows/Linux: Ctrl+Shift+K  (text labels, '+' separator)
// Returns '' when `accelerator` is unparseable.
// Pass `platform` to override OS detection (e.g. 'macos', 'windows', 'linux') for testability.
export function formatAcceleratorForDisplay(accelerator: string, platform?: string): string {
  const result = _parse(accelerator);
  if (result === null) return '';
  const isMac = _isMacOS(platform);
  const parts: string[] = [];
  for (const mod of result.modifiers) {
    const resolved = mod === 'CommandOrControl' ? resolveCommandOrControlModifier(platform) : mod;
    parts.push(_getModifierLabel(resolved, isMac));
  }
  parts.push(getAcceleratorKeyLabel(result.key));
  return isMac ? parts.join('') : parts.join('+');
}

// Returns the canonical key token from a parsed or normalized accelerator, or null when unparseable.
export function getAcceleratorKey(accelerator: string): string | null {
  const result = _parse(accelerator);
  return result === null ? null : result.key;
}

// Renders a key name label for display in menus and tooltips (e.g. 'ArrowUp' → '↑', 'Return' → '↵').
// Returns the key as-is when no special display name is registered.
export function getAcceleratorKeyLabel(key: string): string {
  return _keyDisplayNames.get(key) ?? key;
}

// Renders a modifier key label for the current OS (e.g. 'Meta' → '⌘' on macOS, 'Win' on Windows).
// 'CommandOrControl' is resolved before formatting. Returns '' for unrecognized modifiers.
// Pass `platform` to override OS detection (e.g. 'macos', 'windows', 'linux') for testability.
export function getAcceleratorModifierLabel(modifier: ShortcutModifier, platform?: string): string {
  const resolved = modifier === 'CommandOrControl' ? resolveCommandOrControlModifier(platform) : modifier;
  return _getModifierLabel(resolved, _isMacOS(platform));
}

// Returns the modifier list from a parsed or normalized accelerator, or null when unparseable.
// Writes into `out` (must be an array). `out` is cleared and filled in place.
export function getAcceleratorModifiers(
  accelerator: string,
  out: ShortcutModifier[],
): readonly ShortcutModifier[] | null {
  const result = _parse(accelerator);
  if (result === null) return null;
  out.length = 0;
  for (const m of result.modifiers) out.push(m);
  return out;
}

// Returns all currently registered accelerators in normalized form. Empty on the web backend.
export function getRegisteredGlobalShortcuts(): readonly Accelerator[] {
  return getShortcutBackend().getRegistered() as readonly Accelerator[];
}

// The active shortcut backend, or a lazily-created web default. There is always a backend.
export function getShortcutBackend(): ShortcutBackend {
  if (_backend === null) _backend = createWebShortcutBackend();
  return _backend;
}

// True when the (normalized) chord is already registered. A conflict probe over isGlobalShortcutRegistered.
// Returns false when `accelerator` is unparseable.
export function hasGlobalShortcutConflict(accelerator: string): boolean {
  const normalized = normalizeAccelerator(accelerator);
  if (normalized === null) return false;
  return isGlobalShortcutRegistered(normalized);
}

// True when `input` is a parseable accelerator (valid modifiers + recognized key).
// Callers can use this to distinguish a malformed accelerator from an unsupported one before
// attempting to register.
export function isAcceleratorValid(input: string): boolean {
  return _parse(input) !== null;
}

// True when the accelerator is currently registered. Returns false on web (no global hotkeys).
// Input is normalized before the query so any accepted spelling matches.
export function isGlobalShortcutRegistered(accelerator: string): boolean {
  const normalized = normalizeAccelerator(accelerator);
  if (normalized === null) return false;
  return getShortcutBackend().isRegistered(normalized);
}

// Returns the canonical normalized form of `input` (fixed modifier order, canonical key name), or
// null when unparseable. Two normalized strings that compare === represent the same chord.
// Accepted spellings: Ctrl/Control, Cmd/Command/Meta, Alt/Option, Win/Super, Shift; separators + or -.
export function normalizeAccelerator(input: string): Accelerator | null {
  const result = _parse(input);
  if (result === null) return null;
  return _formatNormalized(result);
}

// Parses `input` into modifiers + key and writes into `out`. Returns `out` on success, null on
// malformed input. Case- and separator-insensitive; alias modifiers (Cmd → Meta, Ctrl → Control,
// Option → Alt, Win → Super) are resolved. Use createParsedAccelerator() to allocate the `out`.
export function parseAccelerator(input: string, out: ParsedAccelerator): ParsedAccelerator | null {
  const result = _parse(input);
  if (result === null) return null;
  (out as { key: string; modifiers: ShortcutModifier[] }).key = result.key;
  (out as { key: string; modifiers: ShortcutModifier[] }).modifiers = result.modifiers.slice();
  return out;
}

// Like parseAccelerator but returns an AcceleratorParseError describing why parsing failed instead
// of null. The common path (parse + ignore error) should use parseAccelerator; this is for
// diagnostics and validation UIs.
export function parseAcceleratorDetailed(
  input: string,
  out: ParsedAccelerator,
): ParsedAccelerator | AcceleratorParseError {
  const result = _parseDetailed(input);
  if ('reason' in result) return result;
  (out as { key: string; modifiers: ShortcutModifier[] }).key = result.key;
  (out as { key: string; modifiers: ShortcutModifier[] }).modifiers = result.modifiers.slice();
  return out;
}

// Registers a global hotkey. Returns false when the host lacks global-hotkey support (e.g. web).
// Input is normalized before registration so any accepted spelling maps to the same registry slot.
// When enableGlobalShortcutSignals() has been called, the onTrigger signal fires after the handler.
export function registerGlobalShortcut(
  accelerator: string,
  handler: (event: Readonly<ShortcutEvent>) => void,
): boolean {
  const normalized = normalizeAccelerator(accelerator);
  if (normalized === null) return false;
  const wrappedHandler = (event: Readonly<ShortcutEvent>) => {
    handler(event);
    if (_signals !== null) emitSignal(_signals.onTrigger, event);
  };
  return getShortcutBackend().register(normalized, wrappedHandler);
}

// Resolves 'CommandOrControl' to 'Meta' on macOS and 'Control' on Windows/Linux.
// Reads the platform directly via navigator.platform to avoid depending on @flighthq/platform.
// Pass `platform` to override OS detection (e.g. 'macos', 'windows', 'linux') for testability.
export function resolveCommandOrControlModifier(platform?: string): Exclude<ShortcutModifier, 'CommandOrControl'> {
  return _isMacOS(platform) ? 'Meta' : 'Control';
}

// Resumes all global shortcuts after suspendAllGlobalShortcuts(). No-op on unsupported hosts.
export function resumeAllGlobalShortcuts(): void {
  getShortcutBackend().setAllEnabled(true);
}

// Installs a native host shortcut backend; pass null to fall back to the web default.
export function setShortcutBackend(backend: ShortcutBackend | null): void {
  _backend = backend;
}

// Temporarily silences all registered global shortcuts without unregistering them — useful when a
// modal or text field has focus. Resume with resumeAllGlobalShortcuts(). No-op on unsupported hosts.
export function suspendAllGlobalShortcuts(): void {
  getShortcutBackend().setAllEnabled(false);
}

// Unregisters every global hotkey. No-op when the host lacks global-hotkey support.
export function unregisterAllGlobalShortcuts(): void {
  getShortcutBackend().unregisterAll();
}

// Unregisters a global hotkey. Returns false when not registered or unsupported (e.g. web).
// Input is normalized before the lookup.
export function unregisterGlobalShortcut(accelerator: string): boolean {
  const normalized = normalizeAccelerator(accelerator);
  if (normalized === null) return false;
  return getShortcutBackend().unregister(normalized);
}

let _backend: ShortcutBackend | null = null;
let _signals: ShortcutSignals | null = null;
const _emptyList: readonly string[] = [];

// Canonical modifier order used in normalized form: Control < Alt < Shift < Meta < Super.
const _modifierOrder: ShortcutModifier[] = ['Control', 'Alt', 'Shift', 'Meta', 'Super'];

// Alias map: lowercase alias → canonical ShortcutModifier.
const _modifierAliases = new Map<string, ShortcutModifier>([
  ['alt', 'Alt'],
  ['cmd', 'Meta'],
  ['command', 'Meta'],
  ['commandorcontrol', 'CommandOrControl'],
  ['control', 'Control'],
  ['ctrl', 'Control'],
  ['meta', 'Meta'],
  ['option', 'Alt'],
  ['shift', 'Shift'],
  ['super', 'Super'],
  ['win', 'Super'],
]);

// Alias map: lowercase alias → canonical ShortcutKeyName (and other accepted key names).
const _keyAliases = new Map<string, string>([
  // Letters (uppercase canonical form)
  ['a', 'A'],
  ['b', 'B'],
  ['c', 'C'],
  ['d', 'D'],
  ['e', 'E'],
  ['f', 'F'],
  ['g', 'G'],
  ['h', 'H'],
  ['i', 'I'],
  ['j', 'J'],
  ['k', 'K'],
  ['l', 'L'],
  ['m', 'M'],
  ['n', 'N'],
  ['o', 'O'],
  ['p', 'P'],
  ['q', 'Q'],
  ['r', 'R'],
  ['s', 'S'],
  ['t', 'T'],
  ['u', 'U'],
  ['v', 'V'],
  ['w', 'W'],
  ['x', 'X'],
  ['y', 'Y'],
  ['z', 'Z'],
  // Digits
  ['0', '0'],
  ['1', '1'],
  ['2', '2'],
  ['3', '3'],
  ['4', '4'],
  ['5', '5'],
  ['6', '6'],
  ['7', '7'],
  ['8', '8'],
  ['9', '9'],
  // Function keys
  ['f1', 'F1'],
  ['f2', 'F2'],
  ['f3', 'F3'],
  ['f4', 'F4'],
  ['f5', 'F5'],
  ['f6', 'F6'],
  ['f7', 'F7'],
  ['f8', 'F8'],
  ['f9', 'F9'],
  ['f10', 'F10'],
  ['f11', 'F11'],
  ['f12', 'F12'],
  ['f13', 'F13'],
  ['f14', 'F14'],
  ['f15', 'F15'],
  ['f16', 'F16'],
  ['f17', 'F17'],
  ['f18', 'F18'],
  ['f19', 'F19'],
  ['f20', 'F20'],
  ['f21', 'F21'],
  ['f22', 'F22'],
  ['f23', 'F23'],
  ['f24', 'F24'],
  // Arrows
  ['arrowdown', 'ArrowDown'],
  ['arrowleft', 'ArrowLeft'],
  ['arrowright', 'ArrowRight'],
  ['arrowup', 'ArrowUp'],
  ['down', 'ArrowDown'],
  ['left', 'ArrowLeft'],
  ['right', 'ArrowRight'],
  ['up', 'ArrowUp'],
  // Navigation
  ['end', 'End'],
  ['home', 'Home'],
  ['pagedown', 'PageDown'],
  ['pageup', 'PageUp'],
  ['pgdn', 'PageDown'],
  ['pgup', 'PageUp'],
  // Editing
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['del', 'Delete'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['enter', 'Return'],
  ['return', 'Return'],
  ['insert', 'Insert'],
  ['ins', 'Insert'],
  ['space', 'Space'],
  ['spacebar', 'Space'],
  [' ', 'Space'],
  ['tab', 'Tab'],
  // Numpad
  ['num0', 'Numpad0'],
  ['num1', 'Numpad1'],
  ['num2', 'Numpad2'],
  ['num3', 'Numpad3'],
  ['num4', 'Numpad4'],
  ['num5', 'Numpad5'],
  ['num6', 'Numpad6'],
  ['num7', 'Numpad7'],
  ['num8', 'Numpad8'],
  ['num9', 'Numpad9'],
  ['numpad0', 'Numpad0'],
  ['numpad1', 'Numpad1'],
  ['numpad2', 'Numpad2'],
  ['numpad3', 'Numpad3'],
  ['numpad4', 'Numpad4'],
  ['numpad5', 'Numpad5'],
  ['numpad6', 'Numpad6'],
  ['numpad7', 'Numpad7'],
  ['numpad8', 'Numpad8'],
  ['numpad9', 'Numpad9'],
  ['numpadadd', 'NumpadAdd'],
  ['numpaddecimal', 'NumpadDecimal'],
  ['numpaddivide', 'NumpadDivide'],
  ['numpadenter', 'NumpadEnter'],
  ['numpadmultiply', 'NumpadMultiply'],
  ['numpadsubtract', 'NumpadSubtract'],
  // Punctuation / symbols
  ["'", 'Quote'],
  [',', 'Comma'],
  ['-', 'Minus'],
  ['.', 'Period'],
  ['/', 'Slash'],
  [';', 'Semicolon'],
  ['=', 'Equal'],
  ['[', 'BracketLeft'],
  ['\\', 'Backslash'],
  [']', 'BracketRight'],
  ['`', 'Backquote'],
  ['backquote', 'Backquote'],
  ['backslash', 'Backslash'],
  ['bracketleft', 'BracketLeft'],
  ['bracketright', 'BracketRight'],
  ['comma', 'Comma'],
  ['equal', 'Equal'],
  ['minus', 'Minus'],
  ['period', 'Period'],
  ['plus', 'Plus'],
  ['quote', 'Quote'],
  ['semicolon', 'Semicolon'],
  ['slash', 'Slash'],
  // Note: '+' as a key name is mapped via 'plus'; bare '+' is the separator so it is filtered out.
  // Media
  ['medianexttrack', 'MediaNextTrack'],
  ['mediaplaypause', 'MediaPlayPause'],
  ['mediaprevioustrack', 'MediaPreviousTrack'],
  ['mediastop', 'MediaStop'],
  ['volumedown', 'VolumeDown'],
  ['volumemute', 'VolumeMute'],
  ['volumeup', 'VolumeUp'],
  // Lock / utility
  ['capslock', 'CapsLock'],
  ['numlock', 'NumLock'],
  ['print', 'PrintScreen'],
  ['printscreen', 'PrintScreen'],
  ['scrolllock', 'ScrollLock'],
]);

// Human-readable display names for special keys; absent entries use the key name itself.
const _keyDisplayNames = new Map<string, string>([
  ['ArrowDown', '↓'],
  ['ArrowLeft', '←'],
  ['ArrowRight', '→'],
  ['ArrowUp', '↑'],
  ['Backspace', '⌫'],
  ['CapsLock', '⇪'],
  ['Delete', '⌦'],
  ['End', 'End'],
  ['Enter', '↵'],
  ['Escape', 'Esc'],
  ['Home', 'Home'],
  ['Insert', 'Ins'],
  ['MediaNextTrack', '⏭'],
  ['MediaPlayPause', '⏯'],
  ['MediaPreviousTrack', '⏮'],
  ['MediaStop', '⏹'],
  ['NumLock', 'NumLk'],
  ['PageDown', 'PgDn'],
  ['PageUp', 'PgUp'],
  ['PrintScreen', 'PrtSc'],
  ['Return', '↵'],
  ['ScrollLock', 'ScrLk'],
  ['Space', 'Space'],
  ['Tab', '⇥'],
  ['VolumeDown', '🔉'],
  ['VolumeMute', '🔇'],
  ['VolumeUp', '🔊'],
]);

// Returns the platform-specific label string for an already-resolved (non-CommandOrControl) modifier.
// Internal: callers must resolve CommandOrControl before calling this.
function _getModifierLabel(resolved: Exclude<ShortcutModifier, 'CommandOrControl'>, isMac: boolean): string {
  switch (resolved) {
    case 'Alt':
      return isMac ? '⌥' : 'Alt';
    case 'Control':
      return isMac ? '⌃' : 'Ctrl';
    case 'Meta':
      return isMac ? '⌘' : 'Win';
    case 'Shift':
      return isMac ? '⇧' : 'Shift';
    case 'Super':
      return isMac ? '⌘' : 'Super';
    default:
      return '';
  }
}

// Returns true when running on macOS.
// Accepts an optional `platform` override (e.g. 'macos', 'windows', 'linux') for testability.
// Falls back to navigator.platform heuristic. Lightweight — avoids importing @flighthq/platform.
function _isMacOS(platform?: string): boolean {
  if (platform !== undefined) return /^mac/i.test(platform);
  if (typeof navigator === 'undefined') return false;
  const p = navigator.platform ?? '';
  return /mac/i.test(p);
}

interface _Parsed {
  key: string;
  modifiers: ShortcutModifier[];
}

// Core parser. Returns a _Parsed on success or null on failure.
function _parse(input: string): _Parsed | null {
  const result = _parseDetailed(input);
  if ('reason' in result) return null;
  return result;
}

// Core parser with error diagnostics.
function _parseDetailed(input: string): _Parsed | AcceleratorParseError {
  if (!input || input.trim().length === 0) {
    return { reason: 'empty', token: '' };
  }

  const tokens = _splitTokens(input.trim());
  if (tokens.length === 0) {
    return { reason: 'empty', token: '' };
  }

  const modifiers: ShortcutModifier[] = [];
  const seenModifiers = new Set<ShortcutModifier>();
  let key: string | null = null;

  // Process all tokens: if a token is a known modifier alias, treat it as a modifier.
  // The last non-modifier token is the key; if all tokens are modifiers, it is missing-key.
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const mod = _modifierAliases.get(lower);
    if (mod !== undefined) {
      if (seenModifiers.has(mod)) {
        return { reason: 'duplicate-modifier', token };
      }
      seenModifiers.add(mod);
      modifiers.push(mod);
    } else {
      // Could be the key. If we already have a key, the earlier one was an unknown modifier token.
      if (key !== null) {
        return { reason: 'unknown-modifier', token: key };
      }
      key = token;
    }
  }

  if (key === null) {
    return { reason: 'missing-key', token: '' };
  }

  const canonicalKey = _keyAliases.get(key.toLowerCase());
  if (canonicalKey === undefined) {
    return { reason: 'unknown-key', token: key };
  }

  // Sort modifiers in canonical order (Control < Alt < Shift < Meta < Super < CommandOrControl).
  modifiers.sort((a, b) => {
    const ai = _modifierOrder.indexOf(a === 'CommandOrControl' ? 'Control' : a);
    const bi = _modifierOrder.indexOf(b === 'CommandOrControl' ? 'Control' : b);
    return ai - bi;
  });

  return { key: canonicalKey, modifiers };
}

// Splits input into tokens using '+' or '-' as separator. Filters out empty tokens from split.
function _splitTokens(input: string): string[] {
  return input.split(/[+\-]/).filter((t) => t.length > 0);
}

// Builds the normalized Accelerator string from a _Parsed result.
function _formatNormalized(parsed: _Parsed): Accelerator {
  if (parsed.modifiers.length === 0) return parsed.key;
  return [...parsed.modifiers, parsed.key].join('+');
}
