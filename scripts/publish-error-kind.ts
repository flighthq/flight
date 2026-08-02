// Classifies a failed `npm publish` so the publisher knows whether to retry, treat it as done, or
// report it. Split out of publish-packages.ts purely so it is importable and testable — that script
// runs its publish on import, so nothing inside it can be exercised from a test.
//
// The distinction that matters is transient-vs-fatal. Publishing 141 packages concurrently makes
// npm fail in ways that have nothing to do with the package being published, and treating those as
// real failures fails the whole release for no reason. Matching is deliberately on npm's exact
// wording rather than anything loose: a rejected version or a bad tarball must never be mistaken
// for a transient error and silently retried into a false success.

export type PublishErrorKind =
  // This exact version is already on the registry. Reached when a retry follows an attempt that
  // actually landed before the error surfaced — the publish is done, not failed.
  | 'already-published'
  // The registry is throttling. Expected at concurrency; back off and retry.
  | 'rate-limited'
  // npm itself failed, not the publish. Retry the same command.
  | 'transient'
  // A real rejection. Report it.
  | 'fatal';

export function classifyPublishError(detail: string): PublishErrorKind {
  if (ALREADY_PUBLISHED.test(detail)) return 'already-published';
  if (RATE_LIMITED.test(detail)) return 'rate-limited';
  if (NPM_STARTUP_RACE.test(detail)) return 'transient';
  return 'fatal';
}

const ALREADY_PUBLISHED = /EPUBLISHCONFLICT|cannot publish over|previously published version/i;

const RATE_LIMITED = /\b429\b|too many requests|rate.?limit/i;

// npm exited before it finished resolving its own config, so it never reached the upload. Under
// concurrent invocations this is npm racing itself over shared state in the npm cache directory —
// most often pruning ~/.npm/_logs at startup, where several processes readdir and unlink the same
// files. The package is fine; the same command run again succeeds.
const NPM_STARTUP_RACE = /Exit prior to config file resolving|call config\.load\(\) before reading values/i;
