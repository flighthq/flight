import { readFileSync } from 'node:fs';

export type CaptureBatchOperation = 'capture' | 'validate';

export interface CaptureBatchManifestSubject {
  name: string;
  args: string[];
  operations?: CaptureBatchOperation[];
}

export interface CaptureBatchManifest {
  subjects: CaptureBatchManifestSubject[];
}

/** Parses a multi-subject plan whose args are forwarded to the existing capture/validate option surface. */
export function parseCaptureBatchManifest(
  source: string,
  sourceName: string = 'capture batch manifest',
): CaptureBatchManifest {
  const value = JSON.parse(source) as Partial<CaptureBatchManifest>;
  if (!Array.isArray(value.subjects) || value.subjects.length === 0) {
    throw new Error(`${sourceName}: missing non-empty subjects array`);
  }
  for (const subject of value.subjects) {
    if (typeof subject?.name !== 'string' || subject.name === '') {
      throw new Error(`${sourceName}: every subject needs a name`);
    }
    if (!isStringArray(subject.args)) throw new Error(`${sourceName}: subject ${subject.name} needs an args array`);
    if (
      subject.operations !== undefined &&
      (!Array.isArray(subject.operations) ||
        subject.operations.length === 0 ||
        subject.operations.some((operation) => operation !== 'capture' && operation !== 'validate'))
    ) {
      throw new Error(`${sourceName}: subject ${subject.name} has invalid operations`);
    }
  }
  return value as CaptureBatchManifest;
}

/** Reads and parses a capture batch manifest from disk. */
export function readCaptureBatchManifest(path: string): CaptureBatchManifest {
  return parseCaptureBatchManifest(readFileSync(path, 'utf8'), path);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
