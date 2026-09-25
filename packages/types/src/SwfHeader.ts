import type { SwfTagRectangle } from './SwfTagParseState.ts';

/**
 * The fixed header of one SWF file, after any container decompression and before any tag is read.
 *
 * This is deliberately metadata only. What a file *contains* is a separate question with a separate
 * answer shape — a `RequirementSet` from the build-time analyzer — because the two have different
 * costs: this stops at a bounded prefix, while an inventory must walk every tag.
 */
export interface SwfHeader {
  /** Length in bytes the header declares for the uncompressed file, including the 8-byte prefix. */
  readonly fileLength: number;
  /** Frames per second, decoded from the 8.8 fixed-point field. */
  readonly frameRate: number;
  /** Stage bounds in pixels, converted from the twips the file stores. */
  readonly stageBounds: SwfTagRectangle;
  /** SWF format version from the fourth prefix byte. */
  readonly version: number;
}
