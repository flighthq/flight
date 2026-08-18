import { describe, expect, it } from 'vitest';

import { classifyDocumentedCommands, parseDocumentedCommands } from './check-documented-commands';

describe('classifyDocumentedCommands', () => {
  it('resolves a citation naming a script the manifest has', () => {
    const citations = parseDocumentedCommands('doc.md', 'Run `npm run check` first.');
    const byVerdict = classifyDocumentedCommands(citations, new Set(['check']), new Set());
    expect(byVerdict.get('resolved')!.map((c) => c.command)).toEqual(['check']);
    expect(byVerdict.get('missing')).toEqual([]);
  });

  it('reports a citation naming no script as missing', () => {
    const citations = parseDocumentedCommands('doc.md', 'Run `npm run examples:wasm`.');
    const byVerdict = classifyDocumentedCommands(citations, new Set(['check']), new Set());
    expect(byVerdict.get('missing')!.map((c) => c.command)).toEqual(['examples:wasm']);
    expect(byVerdict.get('resolved')).toEqual([]);
  });

  // A workspace-scoped invocation resolves against that workspace's manifest, so the root manifest not
  // having the name is not rot. Scoring these as missing is what made a hand-rolled pass report triple.
  it('excuses a workspace-scoped invocation the root manifest cannot have', () => {
    const citations = parseDocumentedCommands('doc.md', 'npm run build:webgl --workspace=examples/x');
    const byVerdict = classifyDocumentedCommands(citations, new Set(['check']), new Set(['doc.md:1']));
    expect(byVerdict.get('workspace-scoped')!.map((c) => c.command)).toEqual(['build:webgl']);
    expect(byVerdict.get('missing')).toEqual([]);
  });

  // `npm run X` inside a passage about script closures stands for any script rather than citing one.
  it('excuses a metasyntactic placeholder standing for any script', () => {
    const citations = parseDocumentedCommands('doc.md', 'resolve `npm run X` inside script bodies');
    const byVerdict = classifyDocumentedCommands(citations, new Set(['check']), new Set());
    expect(byVerdict.get('metasyntactic')!.map((c) => c.command)).toEqual(['X']);
    expect(byVerdict.get('missing')).toEqual([]);
  });

  it('assigns every citation exactly one verdict', () => {
    const citations = parseDocumentedCommands('doc.md', 'npm run check\nnpm run gone\nnpm run X');
    const byVerdict = classifyDocumentedCommands(citations, new Set(['check']), new Set());
    const classified = [...byVerdict.values()].reduce((sum, list) => sum + list.length, 0);
    expect(classified).toBe(citations.length);
  });
});

describe('parseDocumentedCommands', () => {
  it('records the line a citation appears on', () => {
    const citations = parseDocumentedCommands('doc.md', 'intro\n\nnpm run check');
    expect(citations).toEqual([{ command: 'check', docLine: 3, docPath: 'doc.md' }]);
  });

  it('captures every citation on one line', () => {
    const citations = parseDocumentedCommands('doc.md', 'Run `npm run api` and `npm run order`.');
    expect(citations.map((c) => c.command)).toEqual(['api', 'order']);
  });

  it('captures a colon-separated script name in full', () => {
    const citations = parseDocumentedCommands('doc.md', 'npm run reachability:registrars:baseline');
    expect(citations.map((c) => c.command)).toEqual(['reachability:registrars:baseline']);
  });

  it('finds no citation in prose that never names the command runner', () => {
    expect(parseDocumentedCommands('doc.md', 'The check runs on every push.')).toEqual([]);
  });
});
