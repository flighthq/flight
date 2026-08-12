import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Plugin } from 'vitest/config';
import { createVitest } from 'vitest/node';

import { applyMutantText, WORKER_PROTOCOL_PREFIX } from './unchecked-core';
import type { MutantRequest, MutantResponse } from './unchecked-core';

// A long-lived vitest server that runs mutants for a whole package, replacing the spawn-per-mutant loop.
//
// The measurement that motivates it: a spawned run of a colocated test is 4–7s of which the assertions are
// 16ms — the rest is transforming and importing the module graph, which under this repo's testing convention
// is the whole package (a colocated test imports `@flighthq/<name>/contract`). That work is IDENTICAL for
// every mutant except the one spliced module, and spawning threw it away once per mutant. Holding the vite
// server open keeps the transform cache and pays it once; a rerun then costs about 900ms.
//
// Both the subject file and the test scope travel per request, so ONE server serves every file and both
// tiers of a run. Fixing either at startup was measurably worse: it forced a fresh pool per file per tier,
// and cold start is the dominant remaining cost, so a package would have paid it dozens of times.
//
// It changes no safety property. The mutated text is still served by a `load` hook and still never written to
// disk, so an interrupt at any moment leaves the tree untouched. What it gives up is one process per mutant,
// and `isolate` is deliberately left at vitest's default so each rerun still executes in a fresh environment
// — measured at 926ms against 1883ms for `isolate: false`, so the isolated path is both the safe choice and
// the faster one, and there is no tradeoff to weigh.
//
// The parent supervises: a mutant that hangs or crashes the server takes down only this worker, which the
// parent replaces and whose outstanding mutant it re-runs in a process of its own. So the failure mode of
// batching is slower, never wrong.
async function main(): Promise<void> {
  const packageRoot = process.argv[2] as string;

  // The active mutant, swapped between reruns. `null` is the control: the `load` hook declines and vitest
  // sees every file exactly as it is on disk.
  let current: (MutantRequest & { subject: string }) | null = null;
  let applied = false;

  // The same instrument check the spawned path used, moved in-process. A `load` that never fires means the
  // tests ran against UNMUTATED source, which by pass/fail alone is indistinguishable from a killed mutant.
  // The flag is reset before every rerun so it reports on that rerun and cannot be inherited from an earlier
  // one that did resolve — a stale `true` here would launder exactly the harness failure it exists to catch.
  const plugin: Plugin = {
    enforce: 'pre',
    load(id: string) {
      if (current === null) return null;
      if (resolve(stripQuery(id)) !== current.subject) return null;
      applied = true;
      return applyMutantText(readSource(current.subject), current);
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

  type Specifications = Awaited<ReturnType<typeof vitest.globTestSpecifications>>;
  const specificationsByScope = new Map<string, Specifications>();
  let previousSubject: string | null = null;

  for await (const line of readLines()) {
    const request = JSON.parse(line) as MutantRequest;
    const subject = resolve(request.filePath);
    current = { ...request, subject };
    applied = false;

    // The file leaving the mutated state has to be invalidated too. Its module is still cached holding the
    // PREVIOUS mutant's text, and the plugin now declines it — so without this the next mutant would run
    // against a stale splice of a different file and the verdict would be about neither.
    if (previousSubject !== null && previousSubject !== subject) await vitest.invalidateFile(previousSubject);
    await vitest.invalidateFile(subject);
    previousSubject = subject;

    // Empty targets mean the package's own include glob — the escalation tier.
    const targets = request.targets.length > 0 ? [...request.targets] : undefined;
    const scope = targets?.join('|') ?? '<package>';
    const known = specificationsByScope.get(scope);
    if (known === undefined) {
      const globbed = await vitest.globTestSpecifications(targets);
      // Zero specifications is the repo's evidence invariant: a run with no test files would pass, and every
      // mutant would then "survive" a suite that never existed. Refuse instead of reporting that.
      if (globbed.length === 0) throw new Error(`No test file matched ${scope}.`);
      specificationsByScope.set(scope, globbed);
      await vitest.runTestSpecifications(globbed, true);
    } else await vitest.rerunTestSpecifications(known, true);

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

// Read once per file and held: the mutant offsets were computed against this exact text, so re-reading from
// disk mid-run would silently re-base them if anything edited the file while the run was in flight.
function readSource(path: string): string {
  const known = sources.get(path);
  if (known !== undefined) return known;
  const text = readFileSync(path, 'utf8');
  sources.set(path, text);
  return text;
}

function stripQuery(id: string): string {
  const marker = id.indexOf('?');
  return marker < 0 ? id : id.slice(0, marker);
}

const sources = new Map<string, string>();

await main();
