import { FLIGHT_PACKAGE_AUTHOR, FLIGHT_PACKAGE_LICENSE, getPackageLicenseViolations } from './package-license-policy';

describe('package license policy', () => {
  it('accepts the repository author and MIT declaration', () => {
    expect(
      getPackageLicenseViolations('packages/example/package.json', {
        author: FLIGHT_PACKAGE_AUTHOR,
        license: FLIGHT_PACKAGE_LICENSE,
      }),
    ).toEqual([]);
  });

  it('rejects either missing field', () => {
    expect(getPackageLicenseViolations('packages/example/package.json', {})).toEqual([
      {
        detail: 'got undefined',
        label: 'packages/example/package.json author matches the root LICENSE holder',
      },
      {
        detail: 'got undefined',
        label: 'packages/example/package.json license is "MIT"',
      },
    ]);
  });

  it('rejects declarations that do not match the repository', () => {
    expect(
      getPackageLicenseViolations('package.json', {
        author: 'Another author',
        license: 'ISC',
      }),
    ).toEqual([
      {
        detail: 'got "Another author"',
        label: 'package.json author matches the root LICENSE holder',
      },
      {
        detail: 'got "ISC"',
        label: 'package.json license is "MIT"',
      },
    ]);
  });
});
