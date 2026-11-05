// Generated from crates/flight-useragent/tests/user_agent_native_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { detectEndianness, parseUserAgentRuntime } from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

describe('detectEndianness', () => {
  it('returns a known canonical value', () => {
    const value = detectEndianness();
    expect(value === 'little' || value === 'big' || value === 'unknown').toBe(true);
  });
  it('matches the target byte order', () => {
    const expected = crate.isLittleEndian() ? 'little' : 'big';
    expect(detectEndianness()).toEqual(expected);
  });
});

describe('parseUserAgentRuntime', () => {
  it('returns unknown when window is absent', () => {
    expect(parseUserAgentRuntime(undefined)).toEqual('unknown');
  });
  it('returns web when no host shell globals are present', () => {
    expect(parseUserAgentRuntime(crate.record([]))).toEqual('web');
  });
  it('detects each host shell', () => {
    const electron = crate.record([
      ['process', crate.object([['versions', crate.object([['electron', crate.text('28.0.0')]])]])],
    ]);
    expect(parseUserAgentRuntime(electron)).toEqual('electron');
    expect(parseUserAgentRuntime(crate.record([['__TAURI__', crate.object([])]]))).toEqual('tauri');
    expect(parseUserAgentRuntime(crate.record([['Capacitor', crate.object([])]]))).toEqual('capacitor');
  });
  it('prioritizes electron over tauri when both globals are present', () => {
    const both = crate.record([
      ['__TAURI__', crate.object([])],
      ['process', crate.object([['versions', crate.object([['electron', crate.text('28.0.0')]])]])],
    ]);
    expect(parseUserAgentRuntime(both)).toEqual('electron');
  });
  it('follows js truthiness for probed values', () => {
    expect(parseUserAgentRuntime(crate.record([['__TAURI__', undefined]]))).toEqual('web');
    expect(parseUserAgentRuntime(crate.record([['Capacitor', crate.text('')]]))).toEqual('web');
    expect(parseUserAgentRuntime(crate.record([['Capacitor', false]]))).toEqual('web');
    expect(parseUserAgentRuntime(crate.record([['Capacitor', 0]]))).toEqual('web');
    expect(parseUserAgentRuntime(crate.record([['Capacitor', 1]]))).toEqual('capacitor');
    const stringVersions = crate.record([['process', crate.object([['versions', crate.text('x')]])]]);
    expect(parseUserAgentRuntime(stringVersions)).toEqual('web');
    const emptyElectron = crate.record([
      ['process', crate.object([['versions', crate.object([['electron', crate.text('')]])]])],
    ]);
    expect(parseUserAgentRuntime(emptyElectron)).toEqual('web');
  });
});
