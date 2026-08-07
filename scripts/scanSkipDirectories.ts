// The directories no repository-wide scan descends into, in one place because three scans had three
// copies of this list and the copies had already drifted.
//
// THE DRIFT WAS NOT HYPOTHETICAL. `docs.ts` skipped `.git`, `dist` and `node_modules`; `order.ts` and
// `mocks.ts` skipped those plus `.cache` and six more. So the docs gate's no-git fallback walked a
// 26,461-file fixture cache that its two siblings had excluded — found by planting an unreadable
// directory under `.cache/` and watching only that gate die on it. Synchronising three lists would
// have left three lists; this is the list.
//
// WHAT BELONGS HERE IS BEDROCK ONLY: generated output and tool state that is never source, never a
// document, and never judged by any gate. A directory that one scan must skip for a reason of its own
// does NOT belong here — it belongs at that scan's call site, composed on top:
//
//     const IGNORED_DIRS = new Set([...SCAN_SKIP_DIRECTORIES, '.claude', 'worktrees']);
//
// ★ `.claude` IS DELIBERATELY ABSENT, AND ADDING IT WOULD BREAK THE DOCS GATE SILENTLY. `docs.ts`
// resolves its markdown corpus from this same walk and reads skill documents out of `.claude/skills`,
// so skipping `.claude` here would empty half that corpus in the disk-mode fallback — every pointer a
// skill contributes would vanish and documents it reaches would be reported as orphans. `order.ts` and
// `mocks.ts` skip `.claude` legitimately, which is exactly why they do it at their own call sites and
// not here. The colocated test pins this.
export const SCAN_SKIP_DIRECTORIES: ReadonlySet<string> = new Set([
  '.cache',
  '.git',
  '.idea',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
]);
