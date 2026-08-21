import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

  it('selects a manual request by basename and labels an id/path mismatch by id rather than refusing', () => {
    const directory = requestDirectory({
      first: { id: 'first', targets: [target('first-entry', 'webgl')] },
      second: { id: 'wrong', targets: [target('second-entry', 'webgpu')] },
    });

    expect(getReferenceImageRequestMatrix(directory, 'reference-image-requests/first.json')[0]?.id).toBe('first');
    expect(getReferenceImageRequestMatrix(directory, 'second.json')).toEqual([
      { cellCount: 0, entryLabel: 'second', id: 'second', label: 'second', rendererLabel: '' },
    ]);
  });

  // A LABEL MUST NEVER STOP A CAPTURE, so each of these asserts the SURVIVORS, not just that no throw
  // escaped. The regression being pinned is not "it threw" — it is that one unreadable file took the
  // whole queue down, enumerating zero requests where sixteen were fine and no capture ran for any of
  // them. A test that only caught the throw would pass against a version that returned `[]`.
  it('keeps every sibling when one request cannot be described, whatever is wrong with it', () => {
    for (const broken of [
      { case: 'malformed JSON', write: 'not json at all' },
      // Deliberately well-formed APART from the id, so this case fails for the reason it names. With
      // empty targets it would still fail once the id check was gone, and would vouch for nothing.
      {
        case: 'id disagrees with the filename',
        write: JSON.stringify({ id: 'elsewhere', targets: [{ entry: 'node-alpha', renderer: 'webgl' }] }),
      },
      { case: 'no targets', write: JSON.stringify({ id: 'broken', targets: [] }) },
      { case: 'targets is not an array', write: JSON.stringify({ id: 'broken', targets: 'nope' }) },
      {
        case: 'a target is missing its entry',
        write: JSON.stringify({ id: 'broken', targets: [{ renderer: 'webgl' }] }),
      },
    ]) {
      const directory = requestDirectory({
        alpha: { id: 'alpha', targets: [target('node-alpha', 'webgl')] },
        omega: { id: 'omega', targets: [target('node-omega', 'webgpu')] },
      });
      writeFileSync(join(directory, 'broken.json'), broken.write);

      const matrix = getReferenceImageRequestMatrix(directory);

      expect(
        matrix.map((entry) => entry.id),
        broken.case,
      ).toEqual(['alpha', 'broken', 'omega']);
      expect(
        matrix.find((entry) => entry.id === 'broken'),
        broken.case,
      ).toEqual({
        cellCount: 0,
        entryLabel: 'broken',
        id: 'broken',
        label: 'broken',
        rendererLabel: '',
      });
      // The describable siblings keep their real labels: degrading one file must not degrade the rest.
      expect(matrix.find((entry) => entry.id === 'alpha')?.label, broken.case).toBe('node-alpha (1 cell)');
    }
  });

  // The one failure that must still be fatal. With no listing there is no answer to give, degraded or
  // otherwise, so this is the boundary between "cannot describe a request" and "cannot find the queue".
  it('still throws when the directory itself cannot be listed', () => {
    expect(() => getReferenceImageRequestMatrix(join(tmpdir(), 'reference-image-requests-absent'))).toThrow();
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

  it('sends one exact v2 batch with no legacy per-candidate dispatch path', async () => {
    const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'reference-image-bridge.yml'), 'utf8')) as {
      jobs: { dispatch: { steps: Array<Record<string, unknown>> } };
    };
    const script = (
      workflow.jobs.dispatch.steps.find((step) => step['id'] === 'dispatch') as { with: { script: string } }
    ).with.script;
    expect(script).not.toContain('useBatchDispatch');
    expect(script).not.toContain('legacyCandidates');
    expect(script).not.toContain("event_type: 'flight-reference-image-candidate',");
    const firstId = '00000000-0000-4000-8000-000000000001';
    const secondId = '00000000-0000-4000-8000-000000000002';
    const requests = new Map([
      [`reference-image-requests/${firstId}.json`, '{"id":"first"}\n'],
      [`reference-image-requests/${secondId}.json`, '{"id":"second"}\n'],
    ]);
    const dispatches: unknown[] = [];
    const outputs = new Map<string, string>();
    const failures: string[] = [];
    const github = {
      rest: {
        actions: {
          listWorkflowRunArtifacts: async () => ({
            data: {
              artifacts: [
                {
                  digest: `sha256:${'2'.repeat(64)}`,
                  id: 102,
                  name: `reference-image-candidate-second-label-${secondId}`,
                },
                {
                  digest: `sha256:${'1'.repeat(64)}`,
                  id: 101,
                  name: `reference-image-candidate-first-label-${firstId}`,
                },
              ],
              total_count: 2,
            },
          }),
        },
        repos: {
          createDispatchEvent: async (value: unknown) => {
            dispatches.push(value);
          },
          getContent: async ({ path }: { path: string }) => {
            const request = requests.get(path);
            if (request === undefined) throw new Error(`missing test request ${path}`);
            return { data: { content: Buffer.from(request).toString('base64'), encoding: 'base64' } };
          },
        },
      },
    };
    const core = {
      info: () => undefined,
      setFailed: (message: string) => failures.push(message),
      setOutput: (key: string, value: string) => outputs.set(key, value),
      warning: () => undefined,
    };
    const execute = new Function('github', 'context', 'core', 'require', `return (async () => {\n${script}\n})();`) as (
      ...args: unknown[]
    ) => Promise<void>;

    await execute(
      github,
      { payload: { workflow_run: { head_sha: 'a'.repeat(40), id: 456 } }, repo: { owner: 'flighthq', repo: 'flight' } },
      core,
      createRequire(import.meta.url),
    );

    expect(failures).toEqual([]);
    expect(outputs).toEqual(
      new Map([
        ['sent', '2'],
        ['dispatches', '1'],
      ]),
    );
    expect(dispatches).toEqual([
      {
        client_payload: {
          candidates: [
            {
              artifactDigest: `sha256:${'1'.repeat(64)}`,
              artifactId: 101,
              requestPath: `reference-image-requests/${firstId}.json`,
              requestSha256: createHash('sha256')
                .update(requests.get(`reference-image-requests/${firstId}.json`)!)
                .digest('hex'),
            },
            {
              artifactDigest: `sha256:${'2'.repeat(64)}`,
              artifactId: 102,
              requestPath: `reference-image-requests/${secondId}.json`,
              requestSha256: createHash('sha256')
                .update(requests.get(`reference-image-requests/${secondId}.json`)!)
                .digest('hex'),
            },
          ],
          flightCommit: 'a'.repeat(40),
          repository: 'flighthq/flight',
          schemaVersion: 2,
          workflowRunId: 456,
        },
        event_type: 'flight-reference-image-candidate-batch',
        owner: 'flighthq',
        repo: 'flight-reference-images',
      },
    ]);
  });

  it.each([30, 31, 205])(
    'forwards all %i labeled candidates exactly once across every artifact page',
    async (candidateCount) => {
      const workflow = parse(
        readFileSync(join(ROOT, '.github', 'workflows', 'reference-image-bridge.yml'), 'utf8'),
      ) as {
        jobs: { dispatch: { steps: Array<Record<string, unknown>> } };
      };
      const script = (
        workflow.jobs.dispatch.steps.find((step) => step['id'] === 'dispatch') as { with: { script: string } }
      ).with.script;
      const requests = new Map<string, string>();
      const artifacts = Array.from({ length: candidateCount }, (_, index) => {
        const sequence = index + 1;
        const requestId = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
        const requestPath = `reference-image-requests/${requestId}.json`;
        requests.set(requestPath, `${JSON.stringify({ id: requestId })}\n`);
        return {
          digest: `sha256:${sequence.toString(16).padStart(64, '0')}`,
          id: 10_000 + sequence,
          name: `reference-image-candidate-readable-label-${sequence}-${requestId}`,
        };
      }).reverse();
      const artifactPageRequests: Array<{ page?: number; per_page?: number }> = [];
      const dispatches: unknown[] = [];
      const outputs = new Map<string, string>();
      const failures: string[] = [];
      const github = {
        rest: {
          actions: {
            listWorkflowRunArtifacts: async (parameters: { page?: number; per_page?: number }) => {
              artifactPageRequests.push({ page: parameters.page, per_page: parameters.per_page });
              const page = parameters.page ?? 1;
              // Preserve the API's incident-producing default in the mock: the pre-fix workflow omitted
              // page/per_page and therefore sees only 30. The fixed workflow must explicitly fetch every
              // 100-entry page, including the third page in the 205-candidate control.
              const pageSize = parameters.per_page ?? 30;
              const offset = (page - 1) * pageSize;
              return {
                data: {
                  artifacts: artifacts.slice(offset, offset + pageSize),
                  total_count: artifacts.length,
                },
              };
            },
          },
          repos: {
            createDispatchEvent: async (value: unknown) => {
              dispatches.push(value);
            },
            getContent: async ({ path }: { path: string }) => {
              const request = requests.get(path);
              if (request === undefined) throw new Error(`missing test request ${path}`);
              return { data: { content: Buffer.from(request).toString('base64'), encoding: 'base64' } };
            },
          },
        },
      };
      const core = {
        info: () => undefined,
        setFailed: (message: string) => failures.push(message),
        setOutput: (key: string, value: string) => outputs.set(key, value),
        warning: () => undefined,
      };
      const execute = new Function(
        'github',
        'context',
        'core',
        'require',
        `return (async () => {\n${script}\n})();`,
      ) as (...args: unknown[]) => Promise<void>;

      await execute(
        github,
        {
          payload: { workflow_run: { head_sha: 'a'.repeat(40), id: 456 } },
          repo: { owner: 'flighthq', repo: 'flight' },
        },
        core,
        createRequire(import.meta.url),
      );

      expect(failures).toEqual([]);
      expect(artifactPageRequests).toEqual(
        Array.from({ length: Math.ceil(candidateCount / 100) }, (_, index) => ({ page: index + 1, per_page: 100 })),
      );
      expect(outputs.get('sent')).toBe(String(candidateCount));
      expect(outputs.get('dispatches')).toBe('1');
      expect(dispatches).toHaveLength(1);
      const dispatch = dispatches[0] as {
        client_payload: { candidates: Array<{ artifactId: number; requestPath: string }> };
        event_type: string;
      };
      expect(dispatch.event_type).toBe('flight-reference-image-candidate-batch');
      expect(dispatch.client_payload.candidates).toHaveLength(candidateCount);
      expect(dispatch.client_payload.candidates.map((candidate) => candidate.requestPath)).toEqual(
        [...requests.keys()].sort((left, right) => left.localeCompare(right)),
      );
      expect(
        [...new Set(dispatch.client_payload.candidates.map((candidate) => candidate.artifactId))].sort(
          (left, right) => left - right,
        ),
      ).toEqual(artifacts.map((artifact) => artifact.id).sort((left, right) => left - right));
    },
  );

  it('fails with collected and reported counts when pagination repeats an artifact', async () => {
    const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'reference-image-bridge.yml'), 'utf8')) as {
      jobs: { dispatch: { steps: Array<Record<string, unknown>> } };
    };
    const script = (
      workflow.jobs.dispatch.steps.find((step) => step['id'] === 'dispatch') as { with: { script: string } }
    ).with.script;
    const requestId = '00000000-0000-4000-8000-000000000001';
    const repeatedArtifact = {
      digest: `sha256:${'1'.repeat(64)}`,
      id: 101,
      name: `reference-image-candidate-readable-label-${requestId}`,
    };
    const artifactPages: number[] = [];
    const dispatches: unknown[] = [];
    const failures: string[] = [];
    const infos: string[] = [];
    const github = {
      rest: {
        actions: {
          listWorkflowRunArtifacts: async ({ page }: { page: number }) => {
            artifactPages.push(page);
            return { data: { artifacts: [repeatedArtifact], total_count: 2 } };
          },
        },
        repos: {
          createDispatchEvent: async (value: unknown) => dispatches.push(value),
          getContent: async () => {
            throw new Error('completeness must be established before reading any request');
          },
        },
      },
    };
    const core = {
      info: (message: string) => infos.push(message),
      setFailed: (message: string) => failures.push(message),
      setOutput: () => undefined,
      warning: () => undefined,
    };
    const execute = new Function('github', 'context', 'core', 'require', `return (async () => {\n${script}\n})();`) as (
      ...args: unknown[]
    ) => Promise<void>;

    await execute(
      github,
      { payload: { workflow_run: { head_sha: 'a'.repeat(40), id: 456 } }, repo: { owner: 'flighthq', repo: 'flight' } },
      core,
      createRequire(import.meta.url),
    );

    expect(artifactPages).toEqual([1, 2]);
    expect(failures).toEqual(['artifact pagination collected 1 unique artifact(s), API reports 2']);
    expect(infos).not.toContain('no candidate artifact on this run — nothing was commissioned');
    expect(dispatches).toEqual([]);
  });

  it('fails a truncated empty listing before announcing that nothing was commissioned', async () => {
    const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'reference-image-bridge.yml'), 'utf8')) as {
      jobs: { dispatch: { steps: Array<Record<string, unknown>> } };
    };
    const script = (
      workflow.jobs.dispatch.steps.find((step) => step['id'] === 'dispatch') as { with: { script: string } }
    ).with.script;
    const dispatches: unknown[] = [];
    const failures: string[] = [];
    const infos: string[] = [];
    const github = {
      rest: {
        actions: {
          listWorkflowRunArtifacts: async () => ({ data: { artifacts: [], total_count: 1 } }),
        },
        repos: {
          createDispatchEvent: async (value: unknown) => dispatches.push(value),
          getContent: async () => {
            throw new Error('completeness must be established before reading any request');
          },
        },
      },
    };
    const core = {
      info: (message: string) => infos.push(message),
      setFailed: (message: string) => failures.push(message),
      setOutput: () => undefined,
      warning: () => undefined,
    };
    const execute = new Function('github', 'context', 'core', 'require', `return (async () => {\n${script}\n})();`) as (
      ...args: unknown[]
    ) => Promise<void>;

    await execute(
      github,
      { payload: { workflow_run: { head_sha: 'a'.repeat(40), id: 456 } }, repo: { owner: 'flighthq', repo: 'flight' } },
      core,
      createRequire(import.meta.url),
    );

    expect(failures).toEqual(['artifact pagination collected 0 unique artifact(s), API reports 1']);
    expect(infos).not.toContain('no candidate artifact on this run — nothing was commissioned');
    expect(dispatches).toEqual([]);
  });

  // The same rule as the enumeration, at the second site: an unreadable NAME is a cosmetic problem and
  // must not cost a sibling its dispatch. This asserts the loop keeps going and that the run is still
  // failed afterwards, because the alternative to aborting is not silence — a candidate that was
  // captured and then dropped has to be visible, just not at the price of the ones that were fine.
  it('skips a candidate whose name has no UUID and still dispatches its siblings', () => {
    const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'reference-image-bridge.yml'), 'utf8')) as {
      jobs: { dispatch: { steps: Array<Record<string, unknown>> } };
    };
    const script = (
      workflow.jobs.dispatch.steps.find((step) => step['id'] === 'dispatch') as { with: { script: string } }
    ).with.script;
    // Delimit the branch by LINES. Scanning for the next `}` finds the one closing `${artifact.name}`
    // inside the warning's template literal, which cuts the slice off before the statement under test —
    // and a window that excludes the evidence looks exactly like evidence that is absent.
    const lines = script.split('\n');
    const opens = lines.findIndex((line) => line.includes('if (requestId === undefined)'));
    const closes = lines.findIndex((line, index) => index > opens && line.trim() === '}');
    expect(opens, 'bridge unnamed-candidate branch').toBeGreaterThan(-1);
    expect(closes, 'bridge unnamed-candidate branch never closes').toBeGreaterThan(opens);
    const unnamedBranch = lines.slice(opens, closes + 1).join('\n');

    expect(unnamedBranch).toContain('continue;');
    expect(unnamedBranch, 'aborting the loop here drops sibling candidates that parsed fine').not.toContain('return;');
    expect(script, 'a skipped candidate must still fail the run, after every good one is dispatched').toContain(
      'core.setFailed(`candidate artifact(s) with no request UUID were skipped:',
    );
    // Ordering is the whole point: the failure is reported only after the dispatch loop has finished.
    expect(script.indexOf("core.setOutput('sent'")).toBeLessThan(
      script.indexOf('core.setFailed(`candidate artifact(s) with no request UUID'),
    );
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
