// Decides whether a finished publish actually reached the registry.
//
// publish-packages.ts previously treated `npm publish` exiting 0 as proof of publication. It is not:
// a publish has exited 0 with the registry never receiving the write at all. When that happened to
// @flighthq/types, the run reported "published 162, skipped 0, failed 0" while types' packument was
// never written — and because a locked-version publish pins every internal dep to an exact sibling
// version, the 161 packages that did land all pinned a version that did not exist. The whole `next`
// channel failed to install with ETARGET, and nothing in the release reported a problem.
//
// So the exit code is no longer the success criterion; a read-back is. This module holds the decision
// so it can be tested — publish-packages.ts runs its publish on import, so nothing inside it can be
// exercised from a test (the same reason publish-error-kind.ts is split out).

import { isSnapshotVersionSuperseded } from './snapshot-version-order.js';

export type PublishProblemKind =
  // The version we published is not on the registry. The failure this module exists for.
  | 'missing'
  // The version is there, but the dist-tag still points at an OLDER version, so no consumer
  // resolving through the tag would get it.
  | 'tag-stale'
  // The registry could not be read for this package, so publication is unconfirmed. Reported rather
  // than assumed good: a release that cannot be verified must not be declared verified.
  | 'unreadable';

export interface PublishExpectation {
  name: string;
  version: string;
}

export interface PublishedRegistryState {
  hasVersion: boolean;
  tagVersion: string | undefined;
}

export interface PublishProblem {
  name: string;
  version: string;
  kind: PublishProblemKind;
  tagVersion: string | undefined;
}

export function describePublishProblem(problem: Readonly<PublishProblem>, targetTag: string): string {
  const id = `${problem.name}@${problem.version}`;
  switch (problem.kind) {
    case 'missing':
      return `${id} is NOT on the registry — npm reported success but the version does not exist`;
    case 'tag-stale':
      return `${id} published but \`${targetTag}\` still points at ${problem.tagVersion ?? '(no tag)'}`;
    case 'unreadable':
      return `${id} could not be read back from the registry — publication unconfirmed`;
  }
}

// Returns one problem per package whose intended version is not fully live: absent from the registry,
// or present while the dist-tag lags behind it.
//
// A tag pointing at a NEWER version is not a problem. Two builds whose CI legs finish out of commit
// order both publish, and the newer one legitimately owns the tag — the same race snapshot-version-order.ts
// exists to arbitrate. Reporting that as a failure would make every overlapping release flaky, so the
// tag check fires only when the tag is strictly behind us.
//
// The target tag's NAME is not needed here: readRegistryState already resolved it to the version it
// points at. Only describePublishProblem, which renders the message, takes the name.
export function findPublishProblems(
  expectations: readonly Readonly<PublishExpectation>[],
  state: ReadonlyMap<string, Readonly<PublishedRegistryState>>,
): PublishProblem[] {
  const problems: PublishProblem[] = [];
  for (const { name, version } of expectations) {
    const entry = state.get(name);
    if (entry === undefined) {
      problems.push({ name, version, kind: 'unreadable', tagVersion: undefined });
      continue;
    }
    if (!entry.hasVersion) {
      problems.push({ name, version, kind: 'missing', tagVersion: entry.tagVersion });
      continue;
    }
    if (entry.tagVersion === version) continue;
    if (entry.tagVersion !== undefined && isSnapshotVersionSuperseded(version, entry.tagVersion)) continue;
    problems.push({ name, version, kind: 'tag-stale', tagVersion: entry.tagVersion });
  }
  return problems;
}
