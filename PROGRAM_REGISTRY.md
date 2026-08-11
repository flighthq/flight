# Registry program

## Stage 4 ruling

Both Stage 4 threads are authorized. The split is the boundary between additive construction and migration:

- **Thread A — additive:** build `@flighthq/requirements`, `@flighthq/registry`, `@flighthq/registry-catalog`, `@flighthq/registry-codegen`, `@flighthq/tool-registry`, and `scripts/catalog.ts`. Existing code imports none of these packages during this thread.
- **Thread B — migration:** rewire existing registrars and consumers only after the rendering-drift work closes. Thread A must not touch existing registrar implementations, harness registration chains, or coverage consumers to make the new cells appear integrated.

Registry-catalog contents are not part of Thread A. The caller-filled versus self-filling ownership lane remains a user decision, so this stage provides the empty caller-owned catalog mechanism without populating built-in registrations or encoding either population policy.

The ruled registry-table surface is persistent replacement through `withRegistryTableEntry`, explicit bound and tombstoned entry states, `KeyedTable.entries` as `ReadonlyMap<Kind, RegistryTableEntry<T>>`, absence as the separate `withoutRegistryTableEntry` operation, and mismatch rejection during composition. `OrdinalTable` has no tombstone or composition path.

Until the rendering-drift work closes, any rendering evidence used by either thread is verified against the capture `sha256`, never the coarse fingerprint. Thread A changes no rendering output and requires no baseline recapture.
