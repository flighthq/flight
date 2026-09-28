import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildExamplesWebEntryHtml } from './examples-web-entry-html.ts';
import { resolveExampleRenderModule } from './examples-web-render-module.ts';

describe('examples backend resolution', () => {
  it('maps the explicit default source import only for a query-tagged runner entry', () => {
    const root = resolve(import.meta.dirname, '..');
    const appPath = resolve(root, 'examples/packages/clock/src/app.ts');
    const source = readFileSync(appPath, 'utf8');
    const specifier = source.match(/from '(\.\/render[^']+)'/)?.[1];

    expect(specifier).toBe('./render.ts');
    expect(resolveExampleRenderModule(specifier!, `${appPath}?render=dom`)).toBe(
      resolve(root, 'examples/packages/clock/src/render.dom.ts'),
    );
    expect(resolveExampleRenderModule(specifier!, appPath)).toBeUndefined();
  });
});

describe('buildExamplesWebEntryHtml', () => {
  it('surfaces thrown and rejected module startup failures in both build and dev pages', () => {
    const built = buildExamplesWebEntryHtml('effects', 'webgpu', '/examples/effects/webgpu/index.js', {
      assetBase: '/example-assets/effects/',
    });
    const dev = buildExamplesWebEntryHtml('effects', 'webgpu', '/@id/virtual:entry:effects:webgpu', {
      viteClient: true,
    });

    for (const html of [built, dev]) {
      expect(html).toContain("el.id = 'ft-error'");
      expect(html).toContain("window.addEventListener('error'");
      expect(html).toContain("window.addEventListener('unhandledrejection'");
      expect(html).toContain('(e.error && e.error.stack) || e.message');
      expect(html).toContain('(e.reason && e.reason.stack) || String(e.reason)');
      expect(html).toContain('window.parent.console.error("[effects/webgpu]", msg)');
    }
    expect(built).toContain('<base href="/example-assets/effects/" />');
    expect(dev).toContain('<script type="module" src="/@vite/client"></script>');
  });
});
