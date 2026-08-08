import { readFileSync } from 'node:fs';

import {
  DOC_BUDGETS,
  DOC_BUDGET_WARN_FRACTION,
  findFrontMatterPointerTargets,
  findGateDirectories,
  findGateEntries,
  findGateMarkdown,
  findMapStatusClaims,
  findMarkdownLinkTargets,
  findOrphanDocs,
  findOverlongStatusLogs,
  findReachableDocs,
  findStaleStatusLogs,
  findUnacknowledgedCellDocs,
  findUncoveredPackages,
  getDocBudgetStatus,
  hasGatePath,
  isAuthorityBearingDoc,
  reportDocBudget,
} from './docs';
import type { StatusLogEntry } from './docs';

function mapWith(...entries: readonly string[]): string {
  return ['# Map', '', '## Domain Conventions', '', ...entries, '', '## Next Section', ''].join('\n');
}

// Which named functions in the gate's source contain a call to something. Crude by design: the rule it
// pins is about the source text, so reading the source text is the honest way to check it.
function scanCallSites(source: string, call: string): readonly string[] {
  const named: string[] = [];
  for (const block of source.split(/\n(?=(?:export )?function |const )/)) {
    const name = block.match(/^(?:export )?function (\w+)/);
    if (name !== null && block.includes(call)) named.push(name[1]);
  }
  return named;
}

describe('DOC_BUDGETS', () => {
  it('holds every budgeted doc within its stated limit', () => {
    // The gate's own subject: this fails exactly when a budgeted doc has outgrown the map, which is
    // the whole point of writing the budget down.
    for (const budget of DOC_BUDGETS) {
      expect(reportDocBudget(budget, readFileSync(budget.path, 'utf8')).status).not.toBe('over');
    }
  });

  it('states a limit matching the one the doc declares in its own prose', () => {
    // A table that drifts from the doc teaches the reader the wrong number, and the reader is who
    // decides what to cut.
    for (const budget of DOC_BUDGETS) {
      const stated = budget.limit.toLocaleString('en-US');
      expect(readFileSync(budget.path, 'utf8')).toContain(stated);
    }
  });
});

// THE RULE ITSELF, not an instance of it. Two separate fixes have now scoped one check to git while a
// sibling check kept walking the disk — the second time from twelve lines away — because both fixes were
// pinned to the check that happened to fail. A test on one more check would have been the third such
// pin. This one fails the moment ANY new check reaches for the filesystem, including checks nobody has
// written yet, which is the only form that cannot come back.
describe('docs gate scanning policy', () => {
  const SOURCE = readFileSync('scripts/docs.ts', 'utf8');

  it('resolves every scan from git, so exactly one function may enumerate the disk', () => {
    // The named survivor is the last-resort fallback for a checkout with no git, and it exists so no
    // check needs a second code path. An UNEXPLAINED survivor is the next recurrence, so the list is
    // exact rather than a maximum.
    expect(scanCallSites(SOURCE, 'readdirSync(')).toEqual(['listWorkingTreeFiles']);
  });

  it('asks the filesystem whether a file is PRESENT in exactly one place', () => {
    // `existsSync` is the other way a check silently starts judging the disk: membership must come from
    // the gate's file set, and only reading content may consult the working tree.
    expect(scanCallSites(SOURCE, 'existsSync(')).toEqual(['readGateFile']);
  });

  it('reads file content in exactly one place, which is what may legitimately touch the disk', () => {
    // Content has to come from the working tree — a gate that read committed content could never see
    // the edit it is being run on. Routing it through one function is what keeps that concession from
    // spreading into membership.
    expect(scanCallSites(SOURCE, 'readFileSync(')).toEqual(['readGateFile']);
  });
});

describe('findFrontMatterPointerTargets', () => {
  it('counts a charter front-matter registration, the established way a cell claims an extra doc', () => {
    const text = ['---', 'package: x', 'rigModel: ./rig-model.md', '---', '', '# Cell'].join('\n');
    // The leading `./` is kept, not stripped: the target is resolved against the charter's own
    // directory, and `resolve` treats both forms identically. Normalizing here would only add a
    // second place for the two spellings to disagree.
    expect(findFrontMatterPointerTargets(text)).toEqual(['./rig-model.md']);
  });

  it('ignores a non-pointer key, so a date or a package name is never read as a path', () => {
    const text = ['---', 'lastDirection: 2026-08-04', 'crate: flighthq-x', '---'].join('\n');
    expect(findFrontMatterPointerTargets(text)).toEqual([]);
  });

  it('reads only the front matter, not a body line that happens to look like a key', () => {
    const text = ['---', 'package: x', '---', '', 'note: ./not-a-pointer.md'].join('\n');
    expect(findFrontMatterPointerTargets(text)).toEqual([]);
  });
});

// A MINIMAL PAIR for the phantom-package defect, and the pair differs in ONE thing: whether the
// repository has a file under the directory. `packages/scene`, `packages/surface` and the four
// `packages/displayobject-…` are emptied husks of directories renamed long ago; a scan that enumerated
// them off the disk reported six phantom packages as missing their cell, and four clones produced four
// different counts — 8, 2, 11 and zero — with none of the four wrong.
describe('findGateDirectories', () => {
  it('does NOT see a directory the repository has no file under — the emptied rename husk', () => {
    expect(findGateDirectories(new Set(['packages/mesh/package.json']), 'packages')).toEqual(['mesh']);
  });

  it('DOES see the same directory once the repository has one file in it', () => {
    const files = new Set(['packages/mesh/package.json', 'packages/scene/package.json']);
    expect(findGateDirectories(files, 'packages')).toEqual(['mesh', 'scene']);
  });

  it('names a directory once however many files sit under it, at any depth', () => {
    const files = new Set(['packages/mesh/package.json', 'packages/mesh/src/deep/a.ts']);
    expect(findGateDirectories(files, 'packages')).toEqual(['mesh']);
  });

  it('does not mistake a sibling whose name merely starts the same', () => {
    // `packagesold/x` shares five characters with `packages` and none of its meaning.
    expect(findGateDirectories(new Set(['packagesold/x/y.ts']), 'packages')).toEqual([]);
  });

  it('does not report a file sitting directly in the directory as a directory', () => {
    expect(findGateDirectories(new Set(['packages/README.md']), 'packages')).toEqual([]);
  });
});

describe('findGateEntries', () => {
  it('names the files directly inside a directory', () => {
    const files = new Set(['agents/packages/swf/charter.md', 'agents/packages/swf/tag-coverage.md']);
    expect(findGateEntries(files, 'agents/packages/swf')).toEqual(['charter.md', 'tag-coverage.md']);
  });

  it('does NOT descend, so a nested file is not reported as an entry of the parent', () => {
    expect(findGateEntries(new Set(['agents/packages/swf/notes/deep.md']), 'agents/packages/swf')).toEqual([]);
  });
});

// The other minimal pair, for the corpus this gate judges. The scope decision used to sit inside
// `findOrphanDocs` as an extra argument, which is exactly why the sibling check twelve lines away kept
// scanning the disk: the fix was pinned to one check rather than to the gate. It lives here now, where
// every scan draws from it.
describe('findGateMarkdown', () => {
  it('does NOT judge a doc the repository does not track — generated output nobody committed', () => {
    const files = new Set(['agents/commands.md']);
    expect(findGateMarkdown(files, 'agents')).toEqual(['agents/commands.md']);
  });

  it('DOES judge the same doc once git tracks it', () => {
    const doc = 'agents/reviews/alignment/api/generated.md';
    expect(findGateMarkdown(new Set(['agents/commands.md', doc]), 'agents')).toContain(doc);
  });

  it('finds docs at any depth and ignores non-markdown', () => {
    const files = new Set(['agents/a.md', 'agents/conventions/b.md', 'agents/packages/todo.mjs']);
    expect(findGateMarkdown(files, 'agents')).toEqual(['agents/a.md', 'agents/conventions/b.md']);
  });

  it('stays inside the directory it was asked about', () => {
    expect(findGateMarkdown(new Set(['AGENTS.md', 'packages/mesh/README.md']), 'agents')).toEqual([]);
  });
});

describe('findMapStatusClaims', () => {
  it('finds no progress claim in the live map', () => {
    // The gate's own subject. The baseline is zero, so this fails exactly when an edit reintroduces
    // the second source of truth the rule exists to prevent.
    for (const budget of DOC_BUDGETS) {
      expect(findMapStatusClaims(readFileSync(budget.path, 'utf8'))).toEqual([]);
    }
  });

  it('flags the shape that actually drifted: a status stamped onto a pointer entry', () => {
    // Verbatim from the map before the cleanup. It claimed M2 while the linked doc said M2–M5 had
    // landed, which is the drift no reader could see from the map alone.
    const claims = findMapStatusClaims(
      mapWith(
        '- [texture source model](agents/texture-source-model.md) — **spec, locked 2026-07-30; only M2 implemented**. Before touching `Texture`.',
      ),
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].entry).toBe('texture source model');
    expect(claims[0].words).toContain('implemented');
    expect(claims[0].words).toContain('2026-07-30');
  });

  it('allows `unratified`, the one status word that changes what an agent may do', () => {
    // It says "do not build on this as settled" rather than reporting how far along the work is, so
    // it stays true until the design is ruled on. Banning it would push authors back to prose that rots.
    expect(
      findMapStatusClaims(
        mapWith(
          '- [render view model](agents/render-view-model.md) — **unratified.** Before touching `ApplicationRenderView`.',
        ),
      ),
    ).toEqual([]);
  });

  it('leaves the surrounding rules alone, which are allowed to say "implemented"', () => {
    // The AAA-completeness rule states a standard rather than reporting progress. A file-wide scan
    // flags it, and a check that contradicts its own doctrine gets muted rather than obeyed.
    const map = [
      '# Map',
      '',
      'The goal is to bring a feature area to AAA completeness — implemented using canonical patterns.',
      'A feature area that is partially built is unfinished work, not a design choice.',
      '',
      '## Domain Conventions',
      '',
      '- [export lanes](agents/conventions/export-lanes.md) — before adding a package export.',
      '',
    ].join('\n');
    expect(findMapStatusClaims(map)).toEqual([]);
  });

  it('ignores code spans and link targets, so a path is never mistaken for a claim', () => {
    // `agents/2026-07-30-notes.md` and a fenced `shipped` are data, not an assertion about progress.
    expect(
      findMapStatusClaims(mapWith('- [notes](agents/2026-07-30-notes.md) — before calling `markShipped`, read this.')),
    ).toEqual([]);
  });

  it('scans only pointer entries, not the rule bullets above them', () => {
    // The rule bullets legitimately name what they ban ("in-flight direction"), so scoping to
    // link-led entries is what keeps the check from flagging its own statement of the rule.
    expect(
      findMapStatusClaims(
        mapWith('- Anything whose audience is one role — plans, reviews, in-flight direction — goes elsewhere.'),
      ),
    ).toEqual([]);
  });
});

describe('findMarkdownLinkTargets', () => {
  it('does NOT count a name in prose or a code span, which is the distinction the gate turns on', () => {
    const text = 'See `seam-audit.md` for the table, and seam-audit.md is in this cell.';
    expect(findMarkdownLinkTargets(text)).toEqual([]);
  });

  it('counts a real link, so a reader who can navigate is what makes a doc reachable', () => {
    expect(findMarkdownLinkTargets('See [the table](seam-audit.md).')).toEqual(['seam-audit.md']);
  });

  it('strips an anchor so a section link still resolves to its file', () => {
    expect(findMarkdownLinkTargets('[x](commands.md#checkpoints)')).toEqual(['commands.md']);
  });

  it('ignores external schemes, which are never local targets', () => {
    expect(findMarkdownLinkTargets('[a](https://example.com) [b](mailto:x@y.z)')).toEqual([]);
  });
});

describe('findOrphanDocs', () => {
  it('flags a doc nothing links to — the half of the invariant checkLinks cannot see', () => {
    const docs = ['agents/reachable.md', 'agents/orphan.md'];
    expect(findOrphanDocs(docs, new Set(['agents/reachable.md']))).toEqual(['agents/orphan.md']);
  });

  it('passes the honest answer: a cell contract file is reached by enumeration, not by pointer', () => {
    const docs = ['agents/packages/interaction/charter.md', 'agents/packages/interaction/status.md'];
    expect(findOrphanDocs(docs, new Set())).toEqual([]);
  });

  it('still flags a NON-contract doc inside a cell, which is exactly what sat unreachable', () => {
    const docs = ['agents/packages/interaction/interaction-state-design.md'];
    expect(findOrphanDocs(docs, new Set())).toEqual(docs);
  });

  // The other half of that allowance's boundary. An allowance is a ruling with class scope — it
  // exonerates every future member of the class, including files nobody has looked at — so it is pinned
  // by where it STOPS, not by its centre. Keyed to the one generated path; a hand-written sibling in the
  // same directory is still required to be reachable.
  it('allows the generated work index, which is a view over cells and never committed', () => {
    expect(findOrphanDocs(['agents/packages/TODO.md'], new Set())).toEqual([]);
  });

  it('does NOT extend that allowance to a hand-written sibling in the same directory', () => {
    expect(findOrphanDocs(['agents/packages/progress.md'], new Set())).toEqual(['agents/packages/progress.md']);
  });
});

describe('findOverlongStatusLogs', () => {
  const entry = (cell: string, length: number): StatusLogEntry => ({ cell, codeDate: null, length, statusDate: null });

  it('reports only the logs past the cap, largest first, so a reader gets somewhere to start', () => {
    const entries = [entry('small', 100), entry('huge', 9_000), entry('big', 7_000)];
    expect(findOverlongStatusLogs(entries, 6_000).map((found) => found.cell)).toEqual(['huge', 'big']);
  });

  // The boundary, not the centre: the cap is a ceiling the file may reach, not one it may approach.
  it('treats a log exactly at the cap as within it', () => {
    expect(findOverlongStatusLogs([entry('exact', 6_000)], 6_000)).toEqual([]);
  });
});

describe('findStaleStatusLogs', () => {
  const entry = (cell: string, statusDate: string | null, codeDate: string | null): StatusLogEntry => ({
    cell,
    codeDate,
    length: 0,
    statusDate,
  });

  it('reports a log whose newest entry predates its package last moving, stalest first', () => {
    const entries = [
      entry('current', '2026-08-06', '2026-08-01'),
      entry('behind', '2026-07-01', '2026-08-06'),
      entry('stalest', '2026-06-24', '2026-08-06'),
    ];
    expect(findStaleStatusLogs(entries).map((found) => found.cell)).toEqual(['stalest', 'behind']);
  });

  // Matches `sumChurnSince`: a log written the same day as a commit is treated as having seen it. Two
  // sibling rules disagreeing on an inclusive boundary is a divergence nothing else would surface.
  it('treats a same-day log as current rather than behind', () => {
    expect(findStaleStatusLogs([entry('sameDay', '2026-08-06', '2026-08-06')])).toEqual([]);
  });

  // The cell types this exists to exclude: absorbed, reserved, downstream, spun-out. "Behind code that
  // does not exist here" is not a finding, and reporting it would put ~35 permanent entries in a list
  // whose whole purpose is to shrink as cells are rewritten.
  it('skips a cell with no local code rather than calling it stale', () => {
    expect(findStaleStatusLogs([entry('downstream', '2026-01-01', null)])).toEqual([]);
  });

  it('skips a log with no dated entry, which is empty rather than stale', () => {
    expect(findStaleStatusLogs([entry('fresh', null, '2026-08-06')])).toEqual([]);
  });
});

// A MINIMAL PAIR, and deliberately so: both halves use the same document, the same content, and exactly
// one pointer. The ONLY difference is whether the file doing the pointing bears authority. A rule pinned
// by a single positive example teaches whatever incidental feature happens to separate it from the
// failures — pointer count, filename, directory — and that unstated discriminator is what misbehaves
// later. Here nothing else can vary, so the pair can only be pinning the thing the rule is about.
describe('findReachableDocs', () => {
  const DOC = 'agents/packages/skeleton2d/rig-model.md';
  const BODY = 'See [the rig model](rig-model.md).';
  const FRONT = ['---', 'package: x', 'rigModel: ./rig-model.md', '---'].join('\n');

  it('does NOT reach a doc pointed at only from status.md — the continuity layer is not a path', () => {
    const reached = findReachableDocs([{ path: 'agents/packages/skeleton2d/status.md', text: BODY }]);
    expect(reached.has(DOC)).toBe(false);
    expect(findOrphanDocs([DOC], reached)).toEqual([DOC]);
  });

  it('DOES reach the same doc, same content, one pointer, once the charter registers it', () => {
    const reached = findReachableDocs([{ path: 'agents/packages/skeleton2d/charter.md', text: FRONT }]);
    expect(reached.has(DOC)).toBe(true);
    expect(findOrphanDocs([DOC], reached)).toEqual([]);
  });

  it('reaches it from a charter body link too, so the fix is not forced into front matter alone', () => {
    const reached = findReachableDocs([{ path: 'agents/packages/skeleton2d/charter.md', text: BODY }]);
    expect(reached.has(DOC)).toBe(true);
  });

  it('resolves a parent-relative target, so a cross-directory pointer still counts', () => {
    const reached = findReachableDocs([
      { path: 'agents/conventions/index.md', text: 'See [commands](../commands.md).' },
    ]);
    expect(reached.has('agents/commands.md')).toBe(true);
  });
});

describe('findUnacknowledgedCellDocs', () => {
  const CELL = 'agents/packages/fixture';
  const DOC = `${CELL}/evidence.md`;
  const EMPTY_CHARTER = ['---', 'package: fixture', '---', '', '# Fixture'].join('\n');

  it('FAILS a supplementary doc linked only from the global index, not from its own charter', () => {
    const globallyReached = findReachableDocs([
      { path: 'agents/index.md', text: '[fixture evidence](packages/fixture/evidence.md)' },
    ]);

    expect(globallyReached.has(DOC)).toBe(true);
    expect(findUnacknowledgedCellDocs(CELL, ['charter.md', 'evidence.md'], EMPTY_CHARTER)).toEqual([DOC]);
  });

  it('PASSES the same doc once its own charter links it', () => {
    const charter = `${EMPTY_CHARTER}\n\n[Evidence](./evidence.md)`;
    expect(findUnacknowledgedCellDocs(CELL, ['charter.md', 'evidence.md'], charter)).toEqual([]);
  });

  it('accepts a charter front-matter pointer too', () => {
    const charter = ['---', 'package: fixture', 'evidence: ./evidence.md', '---', '', '# Fixture'].join('\n');
    expect(findUnacknowledgedCellDocs(CELL, ['charter.md', 'evidence.md'], charter)).toEqual([]);
  });

  it('exempts the four contract files and ignores non-Markdown entries', () => {
    expect(
      findUnacknowledgedCellDocs(
        CELL,
        ['assessment.md', 'charter.md', 'notes.txt', 'review.md', 'status.md'],
        EMPTY_CHARTER,
      ),
    ).toEqual([]);
  });
});

describe('findUncoveredPackages', () => {
  // The blind spot this closes: the per-cell checks iterate cells, so a package with no cell is never
  // visited and never fails. `quadbatch` sat uncovered for weeks with seven consumers.
  it('flags a built package that has no cell', () => {
    expect(findUncoveredPackages(['mesh', 'quadbatch'], new Set(['mesh']))).toEqual(['quadbatch']);
  });

  it('does not flag a cell with no package — chartered-unbuilt and absorbed cells are legitimate', () => {
    expect(findUncoveredPackages(['mesh'], new Set(['mesh', 'physics3d', 'camera2d']))).toEqual([]);
  });

  it('returns nothing when every package is covered', () => {
    expect(findUncoveredPackages(['mesh', 'path'], new Set(['mesh', 'path']))).toEqual([]);
  });
});

describe('getDocBudgetStatus', () => {
  it('fails only ABOVE the limit, so a doc exactly at budget still passes', () => {
    expect(getDocBudgetStatus(40_001, 40_000)).toBe('over');
    expect(getDocBudgetStatus(40_000, 40_000)).toBe('near');
  });

  it('warns within the fraction of the limit and is silent below it', () => {
    const band = 40_000 - 40_000 * DOC_BUDGET_WARN_FRACTION;
    expect(getDocBudgetStatus(band, 40_000)).toBe('near');
    expect(getDocBudgetStatus(band - 1, 40_000)).toBe('ok');
  });

  it('scales the warn band with the limit rather than using a fixed character count', () => {
    expect(getDocBudgetStatus(9_800, 10_000)).toBe('near');
    expect(getDocBudgetStatus(9_799, 10_000)).toBe('ok');
  });
});

describe('hasGatePath', () => {
  it('accepts a file the repository has', () => {
    expect(hasGatePath(new Set(['agents/commands.md']), 'agents/commands.md')).toBe(true);
  });

  it('accepts a directory, which the map links to as readily as a file', () => {
    // `AGENTS.md` links `[agents/](agents/)`, so a link checker that only accepted files would call
    // the map's own pointer broken.
    expect(hasGatePath(new Set(['agents/commands.md']), 'agents')).toBe(true);
  });

  it('REJECTS a target the repository does not have, even where a disk check would accept it', () => {
    // The inverted failure: a link satisfied only by untracked residue resolves on the machine holding
    // it and dangles for everyone else — a false PASS, which is the harder half to notice.
    expect(hasGatePath(new Set(['agents/commands.md']), 'agents/packages/TODO.md')).toBe(false);
  });

  it('does not accept a path that is merely a prefix of a real one', () => {
    expect(hasGatePath(new Set(['agents/commands.md']), 'agents/comm')).toBe(false);
  });
});

describe('isAuthorityBearingDoc', () => {
  it('counts the map, a cell charter, an index, the catalog and the package map', () => {
    for (const path of [
      'AGENTS.md',
      'agents/packages/swf/charter.md',
      'agents/index.md',
      'agents/packages/catalog.md',
      'agents/packages/map.md',
    ]) {
      expect(isAuthorityBearingDoc(path)).toBe(true);
    }
  });

  it('does NOT count status.md — the append-only continuity layer that disclaims its own authority', () => {
    expect(isAuthorityBearingDoc('agents/packages/skeleton2d/status.md')).toBe(false);
  });

  // The second half of the corpus exclusion's boundary, and the reason it is safe for the fixtures in
  // this very file to name real documents. Even if a source tree were ever added to the scanned corpus,
  // a test file could not exonerate a doc: authority is a filename test and no source file passes it.
  it('does not count a source file, so a link in a test fixture can never mark a doc reached', () => {
    expect(isAuthorityBearingDoc('scripts/docs.test.ts')).toBe(false);
    expect(isAuthorityBearingDoc('packages/tool-capture/src/captureValidation.ts')).toBe(false);
  });

  it('does not count a review or assessment either, which record findings rather than direction', () => {
    expect(isAuthorityBearingDoc('agents/packages/image/review.md')).toBe(false);
    expect(isAuthorityBearingDoc('agents/packages/image/assessment.md')).toBe(false);
  });
});

describe('reportDocBudget', () => {
  it('measures characters, not bytes, so a multi-byte doc is not charged twice', () => {
    // '→' is three bytes in UTF-8 and one character; charging bytes would make an em-dash-heavy doc
    // read as over budget while the text a session actually reads is well under it.
    const report = reportDocBudget({ limit: 4, path: 'multibyte.md' }, '→→→');
    expect(report.length).toBe(3);
    expect(report.status).toBe('ok');
  });

  it('carries the path and limit through so a report names which doc to cut', () => {
    const report = reportDocBudget({ limit: 10, path: 'AGENTS.md' }, 'x'.repeat(11));
    expect(report).toEqual({ length: 11, limit: 10, path: 'AGENTS.md', status: 'over' });
  });
});
