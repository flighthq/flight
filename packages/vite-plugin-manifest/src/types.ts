import type { HostDecompressDeflateCapability, HostDecompressLzmaCapability } from '@flighthq/compression/contract';
import type { LogState } from '@flighthq/log/contract';
import type { RequirementCatalog, RequirementCatalogEntry } from '@flighthq/requirement-catalog/contract';
import type { RequirementSetRaw } from '@flighthq/requirement/contract';

/** The decompressors a build supplies so compressed content can be read. */
export interface ContentDecompressors {
  readonly deflate: Readonly<HostDecompressDeflateCapability> | null;
  readonly lzma: Readonly<HostDecompressLzmaCapability> | null;
}

/**
 * How one format is read: whether the bytes are readable at all, and what they require.
 *
 * `isReadable` exists because the two questions have different answers and only one is visible in a
 * `RequirementSet`. An analyzer returns an empty set both for a file that genuinely requires nothing
 * and for a file it could not decode. The separate probe prevents an unreadable file from silently
 * producing a bundle missing every handler its content needed.
 */
export interface ContentAnalyzer {
  readonly analyze: (
    source: Uint8Array,
    decompressors: Readonly<ContentDecompressors>,
    // Optional so analyzers that need no sibling file stay two-argument functions.
    references?: readonly string[],
  ) => RequirementSetRaw;
  readonly isReadable: (source: Uint8Array, decompressors: Readonly<ContentDecompressors>) => boolean;
  /**
   * Sibling files this analyzer needs, as paths relative to the content file, or absent when it needs
   * none. The plugin owns the I/O and returns readable texts to `analyze` in this declared order.
   */
  readonly collectReferences?: (source: Uint8Array) => readonly string[];
}

/** One resolved row: the catalog entry, and the requirement kind it satisfies. */
export interface ManifestModuleEntry {
  readonly entry: Readonly<RequirementCatalogEntry>;
  readonly kind: string;
}

/** What the emitter produced, and every row it could not place. */
export interface ManifestModuleResult {
  /** Rows dropped with the reason, so a caller reports them instead of losing them silently. */
  readonly problems: readonly string[];
  readonly source: string;
}

/** What `createManifestPlugin` accepts. Every input is explicit; nothing is discovered by convention. */
export interface ManifestPluginOptions {
  /** The catalog mapping a requirement to the implementation that satisfies it, for every backend. */
  readonly catalog: Readonly<RequirementCatalog>;
  /**
   * Inflates a `CWS` SWF body or a deflate-compressed AWD2 body. Without it, compressed content is
   * reported as unreadable instead of being analyzed to a silently empty manifest.
   */
  readonly deflate?: Readonly<HostDecompressDeflateCapability> | null;
  /** Decodes a `ZWS` SWF body or an LZMA-compressed AWD2 body. Absent behaves as for `deflate`. */
  readonly lzma?: Readonly<HostDecompressLzmaCapability> | null;
  /** The build tool's log state, which receives default diagnostics when no callback is supplied. */
  readonly logState?: LogState | null;
  /**
   * Called for every unsupported format, unreadable file, analyzer failure and unresolved requirement.
   * A requirement the build cannot place is reported rather than silently dropped.
   */
  readonly onDiagnostic?: (message: string) => void;
}

/** The subset of Vite's plugin surface this factory produces. Structural, so Vite is a peer, not a dep. */
export interface ManifestPlugin {
  /** Runs before Vite's asset handling so `?manifest` requests are claimed as generated modules. */
  readonly enforce: 'pre';
  readonly handleHotUpdate: (context: { readonly file: string }) => void;
  readonly load: (id: string) => Promise<string | null>;
  readonly name: string;
  readonly resolveId: (id: string, importer?: string) => string | null;
}
