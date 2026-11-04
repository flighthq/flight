import { describe, expect, it } from 'vitest';

import { collectPackageSourceFileNames } from './generate-rust-package-sources.ts';

describe('collectPackageSourceFileNames', () => {
  it('keeps only default production modules reachable from the crate root', () => {
    const libSource = `mod ordinary;
#[cfg(test)]
#[path = "../tests/support.rs"]
mod test_support;
#[cfg(feature = "object-api")]
mod sugar_tests;
#[cfg(feature = "gl")]
mod gl_backend;
#[cfg(not(feature = "wgpu"))]
mod fallback_backend;
#[cfg(all(not(test), any(feature = "gl", feature = "wgpu")))]
mod renderer;
pub mod contract;
mod sugar;
`;
    const manifestSource = `[package]
name = "flight-fixture"

[features]
default = ["gl", "wgpu"]
gl = []
wgpu = []
object-api = []
`;

    expect(
      collectPackageSourceFileNames({
        availableFileNames: [
          'contract.rs',
          'fallback_backend.rs',
          'gl_backend.rs',
          'ordinary.rs',
          'renderer.rs',
          'sugar.rs',
          'sugar_tests.rs',
          'test_support.rs',
          'unreachable.rs',
        ],
        libSource,
        manifestSource,
      }),
    ).toEqual(['gl_backend.rs', 'ordinary.rs', 'renderer.rs']);
  });

  it('treats undeclared features as disabled', () => {
    expect(
      collectPackageSourceFileNames({
        availableFileNames: ['plain.rs', 'sugar_tests.rs'],
        libSource: 'mod plain;\n#[cfg(feature = "object-api")]\nmod sugar_tests;\n',
        manifestSource: '[features]\nobject-api = []\n',
      }),
    ).toEqual(['plain.rs']);
  });
});
