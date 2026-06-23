# Filename Alignment: @flighthq/shape

**Verdict:** Clean — single-implementation domain package (no backend variant), so plain domain/object filenames are correct and no backend prefix applies; every file passes the "remove the folder, is it self-describing?" test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `index.ts` — thin barrel re-exporting the five domain files; not a dumping ground.
- `shape.ts` — the `Shape` entity quartet (`createShape`/`createShapeData`/`createShapeRuntime`/`getShapeRuntime`) plus bounds/commands lifecycle. Names the object.
- `scale9Shape.ts` — the `Scale9Shape` entity quartet. Names the object.
- `shapeCommands.ts` — the drawing-command domain (the `appendShape*` builders: fills, strokes, paths, primitives). Names the domain, not one function.
- `shapeFill.ts` — shape-fill analysis (`getShapeFillRegions`, `hasNonSolidShapeFill`). Names the object/domain.
- `shapeHitTestRegistry.ts` — the shape hit-test command registry and dispatch (`registerShapeHitTestCommand`, `hitTestShapeCommandPoint`). Names the domain/object.
- Tests are colocated as `<source>.test.ts` for every source file (`shape`, `scale9Shape`, `shapeCommands`, `shapeFill`, `shapeHitTestRegistry`), mirroring source filenames exactly.
