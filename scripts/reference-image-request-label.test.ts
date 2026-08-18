import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { getReferenceImageRequestLabel, getReferenceImageRequestMatrix } from './reference-image-request-label.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('getReferenceImageRequestLabel', () => {
  it('names a one-entry request and counts every requested cell', () => {
    expect(
      getReferenceImageRequestLabel({
        targets: [target('node-alpha', 'canvas'), target('node-alpha', 'webgl'), target('node-alpha', 'webgpu')],
      }),
    ).toEqual({
      cellCount: 3,
      entryLabel: 'node-alpha',
      label: 'node-alpha (3 cells)',
      rendererLabel: 'canvas, webgl, webgpu',
    });
  });

  it('names every additional distinct entry rather than silently taking the first', () => {
    expect(
      getReferenceImageRequestLabel({
        targets: [
          target('node-alpha', 'webgl'),
          target('node-alpha', 'webgpu'),
          target('shape-fill', 'canvas'),
          target('text-stroke', 'webgl'),
        ],
      }),
    ).toEqual({
      cellCount: 4,
      entryLabel: 'node-alpha +2 more',
      label: 'node-alpha +2 more (4 cells)',
      rendererLabel: 'webgl, webgpu, canvas',
    });
  });

  it('uses the singular cell label and rejects a request it cannot describe honestly', () => {
    expect(getReferenceImageRequestLabel({ targets: [target('node-alpha', 'webgl')] }).label).toBe(
      'node-alpha (1 cell)',
    );
    expect(() => getReferenceImageRequestLabel({ targets: [] })).toThrow('non-empty array');
    expect(() => getReferenceImageRequestLabel({ targets: [{ entry: 'node-alpha', renderer: '' }] })).toThrow(
      'renderer must be a non-empty string',
    );
  });
});

describe('getReferenceImageRequestMatrix', () => {
  it('keeps the request stem as identity and adds presentation fields', () => {
    const directory = requestDirectory({
      '00000000-0000-4000-8000-000000000001': {
        id: '00000000-0000-4000-8000-000000000001',
        targets: [target('node-alpha', 'webgl')],
      },
    });

    expect(getReferenceImageRequestMatrix(directory)).toEqual([
      {
        cellCount: 1,
        entryLabel: 'node-alpha',
        id: '00000000-0000-4000-8000-000000000001',
        label: 'node-alpha (1 cell)',
        rendererLabel: 'webgl',
      },
    ]);
  });

  it('selects a manual request by basename and refuses an id/path mismatch', () => {
    const directory = requestDirectory({
      first: { id: 'first', targets: [target('first-entry', 'webgl')] },
      second: { id: 'wrong', targets: [target('second-entry', 'webgpu')] },
    });

    expect(getReferenceImageRequestMatrix(directory, 'reference-image-requests/first.json')[0]?.id).toBe('first');
    expect(() => getReferenceImageRequestMatrix(directory, 'second.json')).toThrow(
      'request id wrong does not match its path identity second',
    );
  });
});

describe('reference-image request presentation workflow', () => {
  it('derives one matrix record and uses it on all three display surfaces without changing paths', () => {
    const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'reference-image-capture.yml'), 'utf8')) as {
      jobs: {
        capture: { name: string; steps: Array<Record<string, unknown>> };
        requests: { steps: Array<Record<string, unknown>> };
      };
    };
    const queue = workflow.jobs.requests.steps.find((step) => step['id'] === 'queue');
    const upload = workflow.jobs.capture.steps.find((step) => step['uses'] === 'actions/upload-artifact@v4') as {
      with: { name: string; path: string };
    };
    const summary = workflow.jobs.capture.steps.find((step) =>
      String(step['run'] ?? '').includes('### oracle candidate'),
    ) as { env: Record<string, string>; run: string };

    expect(queue?.['run']).toContain('node ./scripts/reference-image-request-label.mjs "$REQUEST_PATH"');
    expect(workflow.jobs.capture.name).toBe(
      'Reference Images · Capture · ${{ matrix.request.label }} · ${{ matrix.request.id }}',
    );
    expect(upload.with.name).toBe(
      'reference-image-candidate-${{ matrix.request.entryLabel }}-${{ matrix.request.id }}',
    );
    expect(upload.with.path).toBe('stage/${{ matrix.request.id }}');
    expect(summary.env).toEqual({
      REQUEST_ID: '${{ matrix.request.id }}',
      REQUEST_LABEL: '${{ matrix.request.label }}',
      REQUEST_RENDERERS: '${{ matrix.request.rendererLabel }}',
    });
    expect(summary.run).toContain('"$REQUEST_LABEL" "$REQUEST_RENDERERS" "$REQUEST_ID"');
  });

  it('keeps requestPath UUID-based for both legacy and readable artifact names', () => {
    const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'reference-image-bridge.yml'), 'utf8')) as {
      jobs: { dispatch: { steps: Array<Record<string, unknown>> } };
    };
    const dispatch = workflow.jobs.dispatch.steps.find((step) => step['id'] === 'dispatch') as {
      with: { script: string };
    };
    const literal = dispatch.with.script.match(/artifact\.name\.match\(\s*\/([^/\n]+)\/([a-z]*),/);
    expect(literal, 'bridge artifact-name parser regex').not.toBeNull();
    const artifactPattern = new RegExp(literal?.[1] ?? '', literal?.[2] ?? '');
    const id = '00000000-0000-4000-8000-000000000001';

    expect(`reference-image-candidate-${id}`.match(artifactPattern)?.groups?.['requestId']).toBe(id);
    expect(`reference-image-candidate-node-alpha-${id}`.match(artifactPattern)?.groups?.['requestId']).toBe(id);
    expect(`reference-image-candidate-node-alpha +2 more-${id}`.match(artifactPattern)?.groups?.['requestId']).toBe(id);
    expect(dispatch.with.script).toContain('const requestPath = `reference-image-requests/${requestId}.json`;');
  });
});

function target(entry: string, renderer: string): { entry: string; renderer: string } {
  return { entry, renderer };
}

function requestDirectory(requests: Readonly<Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), 'reference-image-label-'));
  const directory = join(root, 'reference-image-requests');
  mkdirSync(directory);
  for (const [id, request] of Object.entries(requests)) {
    writeFileSync(join(directory, `${id}.json`), JSON.stringify(request));
  }
  return directory;
}
