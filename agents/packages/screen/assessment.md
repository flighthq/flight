# screen — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Implement `getScreenNearestRect` with actual nearest-screen logic** — currently shares one body with `getScreenContainingRect`. Give it distinct semantics using center-distance fallback (find the screen whose center is closest to the input rect's center), mirroring Electron's `getDisplayNearestPoint` vs `getDisplayMatching` split.
2. **Remove structural divider comments in test file** — delete the `// --- attachScreenSignals ---` and sibling `// --- ... ---` section headers in `screen.test.ts`. The alphabetized `describe` names already carry the structure; the dividers violate the "avoid structural divider comments" source-style rule.

## Approved

1. **Implement `getScreenNearestRect` with actual nearest-screen logic** [2026-07-02 · blanket "platform integration suite sweep"]
2. **Remove structural divider comments in test file** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

None.
