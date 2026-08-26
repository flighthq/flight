import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PublishArtifactManifest {
  name: string;
  version: string;
  description?: string;
  repository?: { directory?: string };
}

export interface PublishArtifactOptions {
  packageDir: string;
  manifest: Readonly<PublishArtifactManifest>;
  rootReadme: string;
  license: string;
  sourceRef: string;
}

interface OriginalFile {
  existed: boolean;
  contents: string;
}

const REPOSITORY_URL = 'https://github.com/flighthq/flight';

export function createPublishedPackageReadme(manifest: Readonly<PublishArtifactManifest>, sourceRef: string): string {
  const directory = manifest.repository?.directory;
  if (directory === undefined) {
    throw new Error(`[publish] ${manifest.name} has no repository.directory for its source link`);
  }

  const description = manifest.description?.trim();
  if (description === undefined || description === '') {
    throw new Error(`[publish] ${manifest.name} has no description for its generated README`);
  }

  return `# ${manifest.name}

${description}

## Install

\`\`\`sh
npm install ${manifest.name}
\`\`\`

Import the supported application-facing API from \`${manifest.name}\`. The \`${manifest.name}/contract\` export is the wider package-to-package contract used to compose Flight itself.

This package is part of the locked-version Flight SDK graph. Applications may instead install and import \`@flighthq/sdk\` when package-level tree shaking is sufficient.

- [Flight project](${REPOSITORY_URL})
- [Source for ${manifest.name}@${manifest.version}](${REPOSITORY_URL}/tree/${sourceRef}/${directory})
- [License](${REPOSITORY_URL}/blob/${sourceRef}/LICENSE.md)
`;
}

export function getPublishedPackageArtifacts(options: Readonly<PublishArtifactOptions>): ReadonlyMap<string, string> {
  const readme =
    options.manifest.name === '@flighthq/sdk'
      ? options.rootReadme
      : createPublishedPackageReadme(options.manifest, options.sourceRef);
  return new Map([
    [join(options.packageDir, 'README.md'), readme],
    [join(options.packageDir, 'LICENSE.md'), options.license],
  ]);
}

// npm includes conventional README/LICENSE files even when a manifest's `files` list omits them. Keep
// those files publish-only: rich package notes in the working tree may evolve independently, while the
// tarball always receives current, version-addressed collateral and the exact root license.
export async function withTemporaryPublishArtifacts<T>(
  options: Readonly<PublishArtifactOptions>,
  action: () => Promise<T>,
): Promise<T> {
  const artifacts = getPublishedPackageArtifacts(options);
  const originals = new Map<string, OriginalFile>();

  try {
    for (const [path, contents] of artifacts) {
      originals.set(path, {
        existed: existsSync(path),
        contents: existsSync(path) ? readFileSync(path, 'utf8') : '',
      });
      writeFileSync(path, contents);
    }
    return await action();
  } finally {
    for (const [path, original] of originals) {
      if (original.existed) writeFileSync(path, original.contents);
      else if (existsSync(path)) unlinkSync(path);
    }
  }
}
