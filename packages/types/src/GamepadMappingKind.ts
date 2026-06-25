/**
 * Identifies the button/axis layout convention a gamepad uses.
 *
 * - `'standard'`: W3C Standard Gamepad Mapping. Button and axis indices
 *   correspond to the `GamepadButtonKind` and `GamepadAxisKind` constants.
 * - `'raw'`: No standard mapping; indices are device-specific.
 * - `''` (empty string): The browser reports no mapping (same as `'raw'`
 *   for practical purposes).
 */
export type GamepadMappingKind = 'standard' | 'raw' | '';
