import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Plugin } from 'vitest/config';
import { createVitest } from 'vitest/node';

import { applyMutantText, WORKER_PROTOCOL_PREFIX } from './unchecked-core';
import type { MutantRequest, MutantResponse } from './unchecked-core';

// A long-lived vitest server that runs many mutants of ONE source file, replacing the spawn-per-mutant loop.
//
// The measurement that motivates it: a spawned run of a colocated test is 4–7s of which the assertions are
// 16ms — the rest is transforming and importing the module graph, which under this repo's testing convention
// is the whole package (a colocated test imports `@flighthq/<name>/contract`). That work is IDENTICAL for
// every mutant of a file except the one spliced module, and spawning threw it away 107 times over. Holding
// the vite server open keeps the transform cache and pays it once; a rerun then costs about 900ms.
//
// It changes no safety property. The mutated text is still served by a `load` hook and still never written to
// disk, so an interrupt at any moment leaves the tree untouched. What it gives up is one process per mutant,
// and `isolate` is deliberately left at vitest's default so each rerun still executes in a fresh environment
// — measured at 926ms against 1883ms for `isolate: false`, so the isolated path is both the safe choice and
// the faster one, and there is no tradeoff to weigh.
//
// The parent supervises: a mutant that hangs or crashes the server takes down only this worker, which the
// parent restarts and whose outstanding mutant it re-runs in a process of its own. So the failure mode of
// batching is slower, never wrong.
async function main(): Promise<void> {
  const packageRoot = process.argv[2] as string;
  const subject = resolve(process.argv[3] as string);
  const original = readFileSync(subject, 'utf8');

  // The active mutant, swapped between reruns. `null` is the control: the `load` hook declines and vitest
  // sees the file exactly as it is on disk.
  let current: MutantRequest | null = null;
  let applied = false;

  // The same instrument check the spawned path used, moved in-process. A `load` that never fires means the
  // tests ran against UNMUTATED source, which by pass/fail alone is indistinguishable from a killed mutant.
  // The flag is reset before every rerun so it reports on that rerun and cannot be inherited from an earlier
  // one that did resolve — a stale `true` here would launder exactly the harness failure it exists to catch.
  const plugin: Plugin = {
    enforce: 'pre',
    load(id: string) {
      if (resolve(stripQuery(id)) !== subject) return null;
      if (current === null) return null;
      applied = true;
      return applyMutantText(original, current);
    },
    name: 'flight-unchecked-mutant-worker',
  };

  // A single no-op reporter, deliberately. Verdicts are read from `vitest.state`, so nothing here needs to
  // report — and the named built-ins (`default`, `dot`) crash under the programmatic API against this repo's
  // base config, which supplies a reporter instance that never receives a context. An empty object satisfies
  // the reporter interface (every hook is optional) and keeps the run silent without suppressing errors.
  const vitest = await createVitest(
    'test',
    { reporters: [{}], root: packageRoot, silent: true, watch: true },
    { plugins: [plugin] },
  );

  let specifications: Awaited<ReturnType<typeof vitest.globTestSpecifications>> | null = null;
  for await (const line of readLines()) {
    const request = JSON.parse(line) as MutantRequest;
    current = request;
    applied = false;
    await vitest.invalidateFile(subject);

    if (specifications === null) {
      // Empty targets mean the package's own include glob — the escalation tier. A worker is built for one
      // tier and keeps it for life, because this glob is what fixes the file set for every later rerun.
      const targets = request.targets.length > 0 ? [...request.targets] : undefined;
      specifications = await vitest.globTestSpecifications(targets);
      // Zero specifications is the repo's evidence invariant: a run with no test files would pass, and every
      // mutant would then "survive" a suite that never existed. Refuse instead of reporting that.
      if (specifications.length === 0) throw new Error(`No test file matched ${targets?.join(', ') ?? '<package>'}.`);
      await vitest.runTestSpecifications(specifications, true);
    } else await vitest.rerunTestSpecifications(specifications, true);

    const files = vitest.state.getFiles();
    // No file having run at all is not a pass. A rerun that matched nothing would otherwise report every
    // mutant as surviving a suite that never executed.
    const passed = files.length > 0 && !files.some((file) => file.result?.state === 'fail');
    respond({ applied, id: request.id, passed });
  }

  await vitest.close();
}

function respond(response: MutantResponse): void {
  // Prefixed because vitest owns stdout too — its watch-mode banners share this stream, so the protocol has
  // to be recognizable rather than merely well-formed.
  process.stdout.write(`${WORKER_PROTOCOL_PREFIX}${JSON.stringify(response)}\n`);
}

async function* readLines(): AsyncGenerator<string> {
  let buffered = '';
  for await (const chunk of process.stdin) {
    buffered += (chunk as Buffer).toString();
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line.length > 0) yield line;
      newline = buffered.indexOf('\n');
    }
  }
}

function stripQuery(id: string): string {
  const marker = id.indexOf('?');
  return marker < 0 ? id : id.slice(0, marker);
}

await main();
