import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');

describe('root README contracts', () => {
  it('uses a package-count statement that remains true for the current graph', () => {
    const packageCount = readdirSync(join(root, 'packages'), { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && existsSync(join(root, 'packages', entry.name, 'package.json')),
    ).length;

    expect(packageCount).toBeGreaterThan(150);
    expect(readme).toContain('more than 150 tree-shakable packages');
    expect(readme).toContain('more than 150 independently importable, publishable packages');
    expect(readme).not.toMatch(/\b149\b/);
  });

  it('keeps the application-loop example wired to the explicit web host', () => {
    const animationSection = readme.slice(readme.indexOf('### Animation'), readme.indexOf('### Interaction'));
    const startIndex = animationSection.indexOf('startApplicationLoop(webHost, app);');

    expect(animationSection).toContain('npm install @flighthq/host-web');
    expect(animationSection).toContain("import { webHost } from '@flighthq/host-web';");
    expect(startIndex).toBeGreaterThan(-1);
  });

  it('does not promise implicit platform backends', () => {
    expect(readme).toContain('Platform implementations are registered explicitly.');
    expect(readme).not.toContain('Web implementations are available by default');
  });
});
