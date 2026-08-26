export interface ConventionalCommit {
  sha: string;
  subject: string;
  body: string;
  type: string | null;
  scope: string | null;
  summary: string;
  breaking: boolean;
}

const conventionalSubject = /^([a-z][a-z0-9-]*)(?:\(([^)]+)\))?(!)?: (.+)$/;

export function parseConventionalCommit(sha: string, subject: string, body = ''): ConventionalCommit {
  const match = conventionalSubject.exec(subject);
  return {
    sha,
    subject,
    body,
    type: match?.[1] ?? null,
    scope: match?.[2] ?? null,
    summary: match?.[4] ?? subject,
    breaking: match?.[3] === '!' || hasBreakingChangeFooter(body),
  };
}

export function isBreakingCommitMessage(message: string): boolean {
  const [subject = '', ...body] = message.split('\n');
  return parseConventionalCommit('', subject, body.join('\n')).breaking;
}

export function isFeatureCommitMessage(message: string): boolean {
  return parseConventionalCommit('', message.split('\n', 1)[0] ?? '').type === 'feat';
}

function hasBreakingChangeFooter(body: string): boolean {
  return /^BREAKING[ -]CHANGE:/m.test(body);
}
