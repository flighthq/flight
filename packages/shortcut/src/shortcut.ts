import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  Accelerator,
  AcceleratorParseError,
  ParsedAccelerator,
  ShortcutBackend,
  ShortcutDropGuard,
  ShortcutEvent,
  ShortcutKeyName,
  ShortcutModifier,
  ShortcutOperation,
  ShortcutSignals,
} from '@flighthq/types/contract';

// Allocates a zeroed ParsedAccelerator for use as an `out` argument to parseAccelerator.
export function createParsedAccelerator(): ParsedAccelerator {
  return { key: '', modifiers: [] };
}

// Disables a registered global shortcut without unregistering it; the handler is preserved and
// can be re-enabled later. Returns false when not registered or unsupported.
export function disableGlobalShortcut(accelerator: string): boolean {
  const normalized = _normalizeForCommand(accelerator, 'disableGlobalShortcut');
  if (normalized === null) return false;
  return getShortcutBackend().setEnabled(normalized, false);
}

// Releases the global shortcut signal group armed by enableGlobalShortcutSignals: disconnects every
// onTrigger listener and drops the group so it becomes eligible for collection. A later
// enableGlobalShortcutSignals arms a fresh group — the identity is not preserved across a dispose.
// Registered shortcuts are untouched; their directly-registered handlers keep firing.
export function disposeGlobalShortcutSignals(): void {
  if (_signals === null) return;
  clearSignal(_signals.onTrigger);
  _signals = null;
}

// Re-enables a previously disabled global shortcut. Returns false when not registered or unsupported.
export function enableGlobalShortcut(accelerator: string): boolean {
  const normalized = _normalizeForCommand(accelerator, 'enableGlobalShortcut');
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

// True when two accelerator strings (in any accepted spelling) represent the same chord.
// Returns false when either is unparseable.
export function equalsAccelerator(a: string, b: string): boolean {
  const na = normalizeAccelerator(a);
  const nb = normalizeAccelerator(b);
  if (na === null || nb === null) return false;
  return na === nb;
}

export function explainShortcutBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// Returns the first accelerator in `candidates` that names the same chord as `accelerator`, or null
// when none does. The conflict probe for a key-binding UI: it answers "is this chord already spoken
// for in *my* binding list", which is the question a settings screen asks before it lets a user
// commit a rebind — hasGlobalShortcutConflict only sees chords already registered with the OS, so it
// cannot see a pending list, another profile's bindings, or a chord the app reserves for itself.
// Comparison is by normalized form, so any accepted spelling on either side matches. Unparseable
// candidates never match, and an unparseable `accelerator` returns null.
export function findAcceleratorConflict(accelerator: string, candidates: readonly string[]): string | null {
  const normalized = normalizeAccelerator(accelerator);
  if (normalized === null) return null;
  for (const candidate of candidates) {
    if (normalizeAccelerator(candidate) === normalized) return candidate;
  }
  return null;
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
export function getAcceleratorKey(accelerator: string): ShortcutKeyName | null {
  const result = _parse(accelerator);
  return result === null ? null : result.key;
}

// Renders a key name label for display in menus and tooltips (e.g. 'ArrowUp' → '↑', 'Return' → '↵').
// Returns the key as-is when no special display name is registered.
export function getAcceleratorKeyLabel(key: ShortcutKeyName): string {
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
// The backend's registry is re-normalized rather than trusted: a native backend may populate the
// registry with non-normalized strings, so each entry is parsed and any that fail to parse are dropped
// — the Accelerator type is earned, not asserted.
export function getRegisteredGlobalShortcuts(): readonly Accelerator[] {
  const raw = getShortcutBackend().getRegistered();
  const result: Accelerator[] = [];
  for (const entry of raw) {
    const normalized = normalizeAccelerator(entry);
    if (normalized !== null) result.push(normalized);
  }
  return result;
}

// The active shortcut backend: custom > host > sentinel. There is always a backend.
export function getShortcutBackend(): ShortcutBackend {
  return _custom ?? _host ?? _sentinel;
}

// True when the (normalized) chord is already registered. A conflict probe over isGlobalShortcutRegistered.
// Returns false when `accelerator` is unparseable.
export function hasGlobalShortcutConflict(accelerator: string): boolean {
  const normalized = normalizeAccelerator(accelerator);
  if (normalized === null) return false;
  return isGlobalShortcutRegistered(normalized);
}

// True when a native host backend is installed (custom or host layer). False means only the
// sentinel is active — no chord can register, and every command is a no-op.
export function hasNativeShortcutBackend(): boolean {
  return _custom !== null || _host !== null;
}

export function installShortcutHostBackend(backend: ShortcutBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
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

export function observeShortcutHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Parses `input` into modifiers + key and writes into `out`. Returns `out` on success, null on
// malformed input. Case- and separator-insensitive; alias modifiers (Cmd → Meta, Ctrl → Control,
// Option → Alt, Win → Super) are resolved. Use createParsedAccelerator() to allocate the `out`.
export function parseAccelerator(input: string, out: ParsedAccelerator): ParsedAccelerator | null {
  const result = _parse(input);
  if (result === null) return null;
  return _copyParsed(result, out);
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
  return _copyParsed(result, out);
}

// Registers a global hotkey. Returns false when the host lacks global-hotkey support (e.g. web).
// Input is normalized before registration so any accepted spelling maps to the same registry slot.
// When enableGlobalShortcutSignals() has been called, the onTrigger signal fires after the handler.
export function registerGlobalShortcut(
  accelerator: string,
  handler: (event: Readonly<ShortcutEvent>) => void,
): boolean {
  const normalized = _normalizeForCommand(accelerator, 'registerGlobalShortcut');
  if (normalized === null) return false;
  const wrappedHandler = (event: Readonly<ShortcutEvent>) => {
    handler(event);
    if (_signals !== null) emitSignal(_signals.onTrigger, event);
  };
  return getShortcutBackend().register(normalized, wrappedHandler);
}

export function resetShortcutBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Resolves 'CommandOrControl' to 'Meta' on macOS and 'Control' on Windows/Linux.
// Reads the platform directly via navigator.platform to avoid depending on @flighthq/platform.
// Pass `platform` to override OS detection (e.g. 'macos', 'windows', 'linux') for testability.
export function resolveCommandOrControlModifier(platform?: string): Exclude<ShortcutModifier, 'CommandOrControl'> {
  return _isMacOS(platform) ? 'Meta' : 'Control';
}

// Resumes all global shortcuts after suspendAllGlobalShortcuts(). No-op on unsupported hosts.
export function resumeAllGlobalShortcuts(): void {
  _reportNoNativeBackend('resumeAllGlobalShortcuts', '');
  getShortcutBackend().setAllEnabled(true);
}

// Installs a custom shortcut backend; pass null to fall back to host or sentinel.
export function setShortcutBackend(backend: ShortcutBackend | null): void {
  _custom = backend;
}

// Installs the drop guard consulted whenever a global-shortcut command returns its sentinel for a
// knowable caller error; null uninstalls it. This is the diagnostics seam, not the caller-facing
// entry point — use enableShortcutGuards, which installs the @flighthq/log reporter through here.
export function setShortcutDropGuard(guard: ShortcutDropGuard | null): void {
  _dropGuard = guard;
}

// Temporarily silences all registered global shortcuts without unregistering them — useful when a
// modal or text field has focus. Resume with resumeAllGlobalShortcuts(). No-op on unsupported hosts.
export function suspendAllGlobalShortcuts(): void {
  _reportNoNativeBackend('suspendAllGlobalShortcuts', '');
  getShortcutBackend().setAllEnabled(false);
}

// Unregisters every global hotkey. No-op when the host lacks global-hotkey support.
export function unregisterAllGlobalShortcuts(): void {
  _reportNoNativeBackend('unregisterAllGlobalShortcuts', '');
  getShortcutBackend().unregisterAll();
}

// Unregisters a global hotkey. Returns false when not registered or unsupported (e.g. web).
// Input is normalized before the lookup.
export function unregisterGlobalShortcut(accelerator: string): boolean {
  const normalized = _normalizeForCommand(accelerator, 'unregisterGlobalShortcut');
  if (normalized === null) return false;
  return getShortcutBackend().unregister(normalized);
}

let _custom: ShortcutBackend | null = null;
let _host: ShortcutBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
let _signals: ShortcutSignals | null = null;

// Diagnostics seam: enableShortcutGuards (separately imported, so its message text and its
// @flighthq/log dependency shake out of a production bundle) fills this, and the command functions
// reach it through the null check. Not enabling guards costs one comparison per command.
let _dropGuard: ShortcutDropGuard | null = null;

const _emptyList: readonly string[] = [];

// Web pages cannot register OS-level global hotkeys; every operation returns a sentinel.
const _sentinel: ShortcutBackend = {
  getRegistered() {
    return _emptyList;
  },
  isRegistered() {
    return false;
  },
  register() {
    return false;
  },
  setAllEnabled() {},
  setEnabled() {
    return false;
  },
  unregister() {
    return false;
  },
  unregisterAll() {},
};

// Canonical modifier order used in normalized form: Control < Alt < Shift < Meta < Super < CommandOrControl.
// CommandOrControl carries its own ordinal (last) so any chord — including one mixing Control and
// CommandOrControl — has a single, input-independent normalized order.
const _modifierOrder: ShortcutModifier[] = ['Control', 'Alt', 'Shift', 'Meta', 'Super', 'CommandOrControl'];

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

// Alias map: lowercase alias → canonical ShortcutKeyName. Typing the values as ShortcutKeyName makes
// the header the checker: a misspelled canonical name here is a compile error rather than an
// accelerator that normalizes to a chord no backend recognizes.
const _keyAliases = new Map<string, ShortcutKeyName>([
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
  // Numpad. The num*/num-operator short forms are the spellings Electron's accelerator syntax
  // documents, so a chord copied from an Electron app parses unchanged.
  ['numadd', 'NumpadAdd'],
  ['numdec', 'NumpadDecimal'],
  ['numdiv', 'NumpadDivide'],
  ['nummult', 'NumpadMultiply'],
  ['numsub', 'NumpadSubtract'],
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
  // Punctuation / symbols. Both symbol characters that double as chord separators are here: the
  // tokenizer hands a trailing '+' or '-' through as a key token rather than eating it, so
  // 'CommandOrControl++' and 'CommandOrControl+-' — the conventional zoom pair — resolve like any
  // other key.
  ["'", 'Quote'],
  ['+', 'Plus'],
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
const _keyDisplayNames = new Map<ShortcutKeyName, string>([
  ['ArrowDown', '↓'],
  ['ArrowLeft', '←'],
  ['ArrowRight', '→'],
  ['ArrowUp', '↑'],
  ['Backspace', '⌫'],
  ['CapsLock', '⇪'],
  ['Delete', '⌦'],
  ['End', 'End'],
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
  key: ShortcutKeyName;
  modifiers: ShortcutModifier[];
}

// Copies a successful parse into a caller-owned ParsedAccelerator. `out.modifiers` is cleared and
// refilled rather than reassigned, so the array the caller allocated with createParsedAccelerator
// stays the array they hold — an out parameter that swapped the array underneath would leave any
// retained reference silently stale.
function _copyParsed(source: Readonly<_Parsed>, out: ParsedAccelerator): ParsedAccelerator {
  out.key = source.key;
  out.modifiers.length = 0;
  for (const modifier of source.modifiers) out.modifiers.push(modifier);
  return out;
}

// Builds the normalized Accelerator string from a _Parsed result.
function _formatNormalized(parsed: Readonly<_Parsed>): Accelerator {
  if (parsed.modifiers.length === 0) return parsed.key;
  return [...parsed.modifiers, parsed.key].join('+');
}

// Normalizes on behalf of a command function, reporting an unparseable input and a missing native
// backend to the drop guard on the way through. When no guard is installed — the production default
// — this is exactly normalizeAccelerator plus one null comparison.
function _normalizeForCommand(accelerator: string, operation: ShortcutOperation): Accelerator | null {
  if (_dropGuard === null) return normalizeAccelerator(accelerator);
  const result = _parseDetailed(accelerator);
  if ('reason' in result) {
    _dropGuard({ accelerator, operation, parseError: result, reason: 'unparseable' });
    return null;
  }
  _reportNoNativeBackend(operation, accelerator);
  return _formatNormalized(result);
}

// Core parser. Returns a _Parsed on success or null on failure.
function _parse(input: string): _Parsed | null {
  const result = _parseDetailed(input);
  if ('reason' in result) return null;
  return result;
}

// Core parser with error diagnostics.
function _parseDetailed(input: string): _Parsed | AcceleratorParseError {
  const tokens = _splitTokens(input.trim(), _tokenScratch);
  if (tokens.length === 0) {
    return { reason: 'empty', token: '' };
  }

  const modifiers: ShortcutModifier[] = [];
  let key: string | null = null;

  // Process all tokens: if a token is a known modifier alias, treat it as a modifier.
  // The last non-modifier token is the key; if all tokens are modifiers, it is missing-key.
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const mod = _modifierAliases.get(lower);
    if (mod !== undefined) {
      // A chord carries at most six modifiers, so a linear scan beats allocating a Set per parse.
      if (modifiers.indexOf(mod) !== -1) {
        return { reason: 'duplicate-modifier', token };
      }
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
  // CommandOrControl has its own ordinal so a chord containing both Control and CommandOrControl
  // sorts deterministically instead of tying on a shared index.
  modifiers.sort((a, b) => _modifierOrder.indexOf(a) - _modifierOrder.indexOf(b));

  return { key: canonicalKey, modifiers };
}

// Reports to the drop guard that a command reached the sentinel, so the command could not have
// taken effect on any input. Silent once a native backend is installed (custom or host layer):
// a native backend answering false is a real answer, not a drop.
function _reportNoNativeBackend(operation: ShortcutOperation, accelerator: string): void {
  if (_dropGuard === null || _custom !== null || _host !== null) return;
  _dropGuard({ accelerator, operation, parseError: null, reason: 'no-native-backend' });
}

// Splits input into tokens on '+' and '-', writing into `out` and returning it.
//
// A separator character only separates when it *terminates* a token, which is what keeps a literal
// '+' or '-' key reachable: in 'Control+-' the '-' opens a token rather than closing the empty one,
// so it survives as the key. A naive split on /[+-]/ drops it, and with it the two most common
// accelerators an application registers — 'CommandOrControl+-' and 'CommandOrControl++' for zoom.
// The same rule makes a lone '+' or '-' a valid one-key accelerator, and leaves 'Ctrl-Shift-K'
// (dash as separator) tokenizing exactly as before.
function _splitTokens(input: string, out: string[]): string[] {
  out.length = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if ((ch === '+' || ch === '-') && i > start) {
      out.push(input.slice(start, i));
      start = i + 1;
    }
  }
  if (start < input.length) out.push(input.slice(start));
  return out;
}

// Scratch for _splitTokens. Contained entirely within _parseDetailed — the token strings are read
// into modifiers/key before the next parse can run, and the array itself never escapes — so reusing
// it costs no aliasing hazard.
const _tokenScratch: string[] = [];
