import { buildExamplesWebEntryHtml } from './examples-web-entry-html';

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
