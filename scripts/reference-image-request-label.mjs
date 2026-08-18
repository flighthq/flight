// Human-readable presentation for outstanding reference-image requests. The request id remains the
// identity everywhere; this module derives only additive display metadata for Actions surfaces.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Derives one honest label for a request without assuming that every target names the same entry.
 * The first entry stays recognizable in a compact Actions label, while the suffix makes every
 * additional distinct entry explicit instead of silently presenting a multi-entry request as one.
 *
 * @param {unknown} value
 * @returns {{ cellCount: number; entryLabel: string; label: string; rendererLabel: string }}
 */
export function getReferenceImageRequestLabel(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('reference-image request must be an object');
  }
  const targets = value.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('reference-image request targets must be a non-empty array');
  }

  const entries = uniqueTargetStrings(targets, 'entry');
  const renderers = uniqueTargetStrings(targets, 'renderer');
  const entryLabel = entries.length === 1 ? entries[0] : `${entries[0]} +${entries.length - 1} more`;
  const cellCount = targets.length;
  const cells = cellCount === 1 ? 'cell' : 'cells';
  return {
    cellCount,
    entryLabel,
    label: `${entryLabel} (${cellCount} ${cells})`,
    rendererLabel: renderers.join(', '),
  };
}

/**
 * Builds the Actions matrix. An optional request path narrows a manual run to one file; only its
 * basename is accepted, matching the workflow's existing path contract without admitting traversal.
 *
 * @param {string} directory
 * @param {string} [requestedPath]
 */
export function getReferenceImageRequestMatrix(directory, requestedPath = '') {
  const files =
    requestedPath === ''
      ? readdirSync(directory)
          .filter((file) => file.endsWith('.json'))
          .sort()
      : [`${basename(requestedPath, '.json')}.json`];

  return files.map((file) => {
    const id = basename(file, '.json');
    const request = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    if (request.id !== id) {
      throw new Error(`${file}: request id ${String(request.id)} does not match its path identity ${id}`);
    }
    return { id, ...getReferenceImageRequestLabel(request) };
  });
}

/** @param {unknown[]} targets @param {'entry' | 'renderer'} field */
function uniqueTargetStrings(targets, field) {
  const values = [];
  for (const [index, target] of targets.entries()) {
    if (target === null || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error(`reference-image request targets[${index}] must be an object`);
    }
    const value = target[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`reference-image request targets[${index}].${field} must be a non-empty string`);
    }
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const requestedPath = process.argv[2] ?? '';
    process.stdout.write(
      `${JSON.stringify(getReferenceImageRequestMatrix('reference-image-requests', requestedPath))}\n`,
    );
  } catch (error) {
    console.error(`reference-image-request-label: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
