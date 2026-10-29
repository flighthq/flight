import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Regressions for generic dependency entities, run through the real `flight-compile` CLI against the real
// `flight-signals` source: `Signal<T>` from a companion-owning dependency renders as its `SignalRaw<T>`
// record, matching the import, and typechecks under `strict` against the real `@flighthq/signals` contract.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

const HUB_FIXTURE = `use flight_signals::Signal;

pub struct Hub {
    pub on_tick: Signal<i32>,
}

pub fn tick(hub: &Hub) -> &Signal<i32> {
    return &hub.on_tick;
}
`;

let workDirectory = '';

beforeAll(() => {
  execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  workDirectory = mkdtempSync(join(tmpdir(), 'flight-compile-dependency-generics-'));
});

afterAll(() => {
  rmSync(workDirectory, { force: true, recursive: true });
});

function compileHub(): string {
  const source = join(workDirectory, 'hub.rs');
  const out = join(workDirectory, 'hub.ts');
  writeFileSync(source, HUB_FIXTURE);
  const result = spawnSync(
    compilerPath,
    [
      'generate',
      '--source',
      source,
      '--out',
      out,
      '--external-alias-source',
      join(repositoryRoot, 'crates', 'flight-signals', 'src', 'types.rs'),
      '--external-alias-module',
      '@flighthq/signals/contract',
    ],
    { encoding: 'utf8' },
  );
  expect(result.stderr.trim()).toBe('');
  return readFileSync(out, 'utf8');
}

describe('flight-compile generic dependency entities', () => {
  it('renders the companion-owned entity by its Raw record name', () => {
    const typescript = compileHub();
    expect(typescript).toContain('import type { SignalRaw } from "@flighthq/signals/contract";');
    expect(typescript).toContain('onTick: SignalRaw<number>;');
    expect(typescript).not.toMatch(/[^w]Signal</);
  });

  it('typechecks against the real signals contract under strict TypeScript', () => {
    const hub = join(workDirectory, 'hub.ts');
    const usage = join(workDirectory, 'usage.ts');
    writeFileSync(hub, compileHub());
    writeFileSync(
      usage,
      [
        "import { createSignal, emitSignal } from '@flighthq/signals/contract';",
        "import type { Hub } from './hub.ts';",
        "import { tick } from './hub.ts';",
        'export function fire(hub: Hub): void {',
        '  emitSignal(tick(hub), 1);',
        '}',
        'export const hub: Hub = { onTick: createSignal<number>() };',
        '',
      ].join('\n'),
    );
    const program = ts.createProgram([hub, usage], {
      allowImportingTsExtensions: true,
      baseUrl: repositoryRoot,
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: { '@flighthq/*/contract': ['packages/*/src/contract.ts'] },
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file === undefined || diagnostic.file.fileName.startsWith(workDirectory))
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    expect(diagnostics).toEqual([]);
    const wrongPayload = join(workDirectory, 'wrong.ts');
    writeFileSync(
      wrongPayload,
      "import { emitSignal } from '@flighthq/signals/contract';\nimport type { Hub } from './hub.ts';\nexport function fire(hub: Hub): void {\n  emitSignal(hub.onTick, 'one');\n}\n",
    );
    const rejected = ts.createProgram([hub, wrongPayload], {
      allowImportingTsExtensions: true,
      baseUrl: repositoryRoot,
      lib: ['lib.es2022.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: { '@flighthq/*/contract': ['packages/*/src/contract.ts'] },
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    });
    expect(
      ts
        .getPreEmitDiagnostics(rejected)
        .filter((diagnostic) => diagnostic.file !== undefined && diagnostic.file.fileName.startsWith(workDirectory))
        .length,
    ).toBeGreaterThan(0);
  });
});
