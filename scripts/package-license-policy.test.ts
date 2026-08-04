import { FLIGHT_PACKAGE_AUTHOR, FLIGHT_PACKAGE_LICENSE, getPackageLicenseViolations } from './package-license-policy';

describe('package license policy', () => {
  it('accepts the repository author and license declaration', () => {
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
        label: `packages/example/package.json license is ${JSON.stringify(FLIGHT_PACKAGE_LICENSE)}`,
      },
    ]);
  });

  it('rejects declarations that do not match the repository', () => {
    expect(
      getPackageLicenseViolations('package.json', {
        author: 'Another author',
        license: ['I', 'SC'].join(''),
      }),
    ).toEqual([
      {
        detail: 'got "Another author"',
        label: 'package.json author matches the root LICENSE holder',
      },
      {
        detail: `got ${JSON.stringify(['I', 'SC'].join(''))}`,
        label: `package.json license is ${JSON.stringify(FLIGHT_PACKAGE_LICENSE)}`,
      },
    ]);
  });
});
