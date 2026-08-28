import {
  checkTransportBypasses,
  createEmptyTransportBypassReport,
  formatTransportBypassReport,
  readPackageTransportSources,
} from './check-transport-bypasses';

describe('checkTransportBypasses', () => {
  it('rejects every direct global transport primitive outside a web backend', () => {
    const report = checkTransportBypasses([
      source(
        'packages/example/src/direct.ts',
        [
          "fetch('/data')",
          'new XMLHttpRequest()',
          "new Request('/data')",
          "new WebSocket('wss://example.test')",
          'new Image()',
          "new EventSource('/events')",
        ].join('\n'),
      ),
    ]);

    expect(report.allowed).toEqual([]);
    expect(report.violations.map((site) => site.primitive)).toEqual([
      'fetch',
      'XMLHttpRequest',
      'Request',
      'WebSocket',
      'Image',
      'EventSource',
    ]);
  });

  it('allows the same population only when enclosed by createWeb*Backend', () => {
    const report = checkTransportBypasses([
      source(
        'packages/example/src/web.ts',
        [
          'export function createWebExampleBackend() {',
          '  function nested() { return new Image() }',
          "  return { fetch: () => fetch('/data'), nested, socket: () => new WebSocket('wss://x') }",
          '}',
          'export const createWebEventsBackend = () => ({',
          "  events: () => new EventSource('/events'),",
          "  requestInfo: () => new Request('/data'),",
          '  request: () => new XMLHttpRequest(),',
          '})',
        ].join('\n'),
      ),
    ]);

    expect(report.violations).toEqual([]);
    expect(report.allowed.map((site) => site.enclosingWebBackend)).toEqual([
      'createWebExampleBackend',
      'createWebExampleBackend',
      'createWebExampleBackend',
      'createWebEventsBackend',
      'createWebEventsBackend',
      'createWebEventsBackend',
    ]);
  });

  it('mutation-proves Request construction cannot move out of a web backend', () => {
    const allowed = checkTransportBypasses([
      source(
        'packages/example/src/request.ts',
        "export function createWebRequestBackend() { return { make: () => new Request('/ok') } }",
      ),
    ]);
    const mutated = checkTransportBypasses([
      source('packages/example/src/request.ts', "export function makeRequest() { return new Request('/bypass') }"),
    ]);

    expect(allowed.violations).toEqual([]);
    expect(allowed.allowed).toHaveLength(1);
    expect(mutated.violations).toHaveLength(1);
    expect(mutated.violations[0]).toMatchObject({ enclosingWebBackend: null, primitive: 'Request' });
  });

  it('rejects a helper outside the backend even when the backend calls it', () => {
    const report = checkTransportBypasses([
      source(
        'packages/example/src/helper.ts',
        [
          "const request = () => fetch('/data')",
          'export function createWebExampleBackend() {',
          '  return { request }',
          '}',
        ].join('\n'),
      ),
    ]);

    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({ enclosingWebBackend: null, primitive: 'fetch' });
  });

  it('does not confuse caller seams or local constructors with global primitives', () => {
    const report = checkTransportBypasses([
      source(
        'packages/example/src/shadowed.ts',
        [
          'export function resolve(fetch: () => void, Image: new () => unknown) {',
          '  fetch()',
          '  new Image()',
          '}',
          'export function locally() {',
          '  const WebSocket = class {}',
          '  return new WebSocket()',
          '}',
        ].join('\n'),
      ),
    ]);

    expect(report.allowed).toEqual([]);
    expect(report.violations).toEqual([]);
  });

  it('detects explicit global-object access and ignores strings and comments', () => {
    const report = checkTransportBypasses([
      source(
        'packages/example/src/globals.ts',
        [
          "(globalThis.fetch)('/data')",
          "new window['WebSocket']('wss://x')",
          'const text = "fetch(\'/not-code\') new Image()"',
          '// new EventSource("/not-code")',
        ].join('\n'),
      ),
    ]);

    expect(report.violations.map((site) => site.primitive)).toEqual(['fetch', 'WebSocket']);
  });

  it('does not mistake a shadowed global-object name for the browser global', () => {
    const report = checkTransportBypasses([
      source(
        'packages/example/src/shadowed-window.ts',
        "export function run(window: { fetch(url: string): void }) { window.fetch('/local') }",
      ),
    ]);

    expect(report.violations).toEqual([]);
  });

  it('derives test, declaration and tooling exclusions by role', () => {
    const report = checkTransportBypasses([
      source('packages/example/src/example.test.ts', "fetch('/test')"),
      source('packages/example/src/globals.d.ts', 'declare const fetch: unknown'),
      source('packages/example/src/globals.d.mts', 'declare const WebSocket: unknown'),
      source('packages/tool-capture/src/client.ts', "fetch('/tool')"),
      source('packages/example/src/runtime.ts', 'export const value = 1'),
    ]);

    expect(report.scannedFiles).toBe(1);
    expect(report.excluded.map((entry) => entry.reason).sort()).toEqual([
      'declaration-source',
      'declaration-source',
      'test-source',
      'tooling-package',
    ]);
    expect(report.violations).toEqual([]);
  });
});

describe('formatTransportBypassReport', () => {
  it('prints the scanned, allowed and excluded populations plus exact failures', () => {
    const report = checkTransportBypasses([
      source('packages/example/src/example.test.ts', "fetch('/test')"),
      source(
        'packages/example/src/runtime.ts',
        "export function createWebNetBackend() { return { send: () => fetch('/ok') } }\nfetch('/bad')",
      ),
    ]);
    const text = formatTransportBypassReport(report);

    expect(text).toContain('1 production files scanned');
    expect(text).toContain('1 backend site allowed');
    expect(text).toContain('test-source: 1');
    expect(text).toContain('createWebNetBackend');
    expect(text).toContain('1 transport bypass');
    expect(text).toContain('packages/example/src/runtime.ts:2');
  });
});

describe('readPackageTransportSources', () => {
  it('runs the real gate end to end with a nonempty derived population', () => {
    const sources = readPackageTransportSources(process.cwd());
    const report = checkTransportBypasses(sources);

    expect(sources.length).toBeGreaterThan(1_000);
    expect(report.scannedFiles).toBeGreaterThan(1_000);
    expect(report.allowed.length).toBeGreaterThan(4);
    expect(report.violations).toEqual([]);
  }, 60_000);
});

describe('createEmptyTransportBypassReport', () => {
  // ★ Compared against the production path, never against a field list written here — a list would be a
  // second copy of the shape, which is the defect the factory exists to remove.
  it('supplies every field the real report producer does', () => {
    const produced = checkTransportBypasses([]);
    expect(Object.keys(createEmptyTransportBypassReport()).sort()).toEqual(Object.keys(produced).sort());
  });

  it('is empty rather than merely well-typed', () => {
    const empty = createEmptyTransportBypassReport();
    expect(empty.scannedFiles).toBe(0);
    expect(empty.allowed).toEqual([]);
    expect(empty.excluded).toEqual([]);
    expect(empty.violations).toEqual([]);
  });
});

function source(path: string, text: string): { path: string; text: string } {
  return { path, text };
}
