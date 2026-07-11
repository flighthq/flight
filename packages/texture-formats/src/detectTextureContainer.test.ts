import { describe, expect, it } from 'vitest';

import { detectTextureContainer } from './detectTextureContainer';

const ktx2Magic = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

describe('detectTextureContainer', () => {
  it('sniffs the KTX2 identifier', () => {
    expect(detectTextureContainer(new Uint8Array([...ktx2Magic, 0, 0, 0, 0]))).toBe('ktx2');
  });

  it('sniffs the ATF signature', () => {
    expect(detectTextureContainer(new Uint8Array([0x41, 0x54, 0x46, 0, 0, 0]))).toBe('atf');
  });

  it('sniffs the DDS magic', () => {
    expect(detectTextureContainer(new Uint8Array([0x44, 0x44, 0x53, 0x20, 0, 0]))).toBe('dds');
  });

  it('sniffs the Basis signature', () => {
    expect(detectTextureContainer(new Uint8Array([0x73, 0x42, 0, 0]))).toBe('basis');
  });

  it('returns null for an unrecognized or too-short buffer', () => {
    expect(detectTextureContainer(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(detectTextureContainer(new Uint8Array([0x73]))).toBeNull();
    expect(detectTextureContainer(new Uint8Array(0))).toBeNull();
  });

  it('does not mistake a truncated KTX2 identifier for KTX2', () => {
    expect(detectTextureContainer(new Uint8Array(ktx2Magic.slice(0, 8)))).toBeNull();
  });
});
