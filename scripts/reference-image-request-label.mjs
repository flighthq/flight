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
 * A LABEL IS DISPLAY-ONLY AND MUST NEVER STOP A CAPTURE. Every per-file failure degrades to the id
 * and continues, because this function's answer is "which requests are outstanding" and describing
 * them is the additive part. It briefly did the opposite: it parsed every request and threw, so ONE
 * unreadable file enumerated zero requests instead of the other sixteen, and no capture ran for any
 * of them. Presentation had silently become a precondition for the pipeline running at all.
 *
 * The failure is reported on STDERR, never stdout — stdout is the matrix JSON the workflow assigns
 * to `list`, so a diagnostic written there would be parsed as data.
 *
 * This deliberately does NOT validate requests. Nothing else does either, which is exactly why a
 * validator must be added on purpose, as a gate that fails at authoring time where a hard failure is
 * correct — not inherited by whichever code happens to parse these files first.
 *
 * Listing the directory may still throw, with ONE exception. An absent directory is not a failure to
 * read the queue — it IS the queue, and the answer is "nothing outstanding". Deleting the last request
 * removes the folder with it, and treating that as fatal turned the ordinary empty state into a red CI
 * job: `ENOENT: no such file or directory, scandir 'reference-image-requests'`, exit 1, on a repository
 * that simply had no work queued. The workflow is already built for an empty queue — it gates the
 * capture matrix on `any == 'true'` so the cheap enumerate job runs alone — and this was the one thing
 * standing between it and that design.
 *
 * Every OTHER listing error still throws. A permissions failure or an I/O error means the queue could
 * not be read, which is not the same as the queue being empty, and reporting "nothing outstanding" for
 * one of those would skip real work silently — the exact failure this pipeline has hit before.
 *
 * @param {string} directory
 * @param {string} [requestedPath]
 */
/**
 * The request filenames in `directory`, or none when the directory does not exist.
 *
 * @param {string} directory
 * @returns {string[]}
 */
function listRequestFiles(directory) {
  try {
    return readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .sort();
  } catch (error) {
    if (error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return [];
    throw error;
  }
}

export function getReferenceImageRequestMatrix(directory, requestedPath = '') {
  const files = requestedPath === '' ? listRequestFiles(directory) : [`${basename(requestedPath, '.json')}.json`];

  return files.map((file) => {
    // The stem is the identity: it is what every path is built from, so it is known before the file
    // is read and stays correct however badly the contents are malformed.
    const id = basename(file, '.json');
    try {
      const request = JSON.parse(readFileSync(join(directory, file), 'utf8'));
      if (request.id !== id) {
        throw new Error(`request id ${String(request.id)} does not match its path identity ${id}`);
      }
      return { id, ...getReferenceImageRequestLabel(request) };
    } catch (error) {
      process.stderr.write(
        `reference-image-request-label: ${file}: ${error instanceof Error ? error.message : String(error)}; ` +
          `labelling it by id and continuing\n`,
      );
      return { id, cellCount: 0, entryLabel: id, label: id, rendererLabel: '' };
    }
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
