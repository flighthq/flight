# camera — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. Remove stream-of-consciousness comment in `basis.ts` ("wait, this is col 1 of R" / "Actually...").
2. Investigate `getCameraLinearDepth` ortho path -- may be load-bearing. Do NOT fix blindly; verify if any effects package depends on current behavior before changing.

## Approved

None.

## Backlog

- Reversed-Z.
- Off-axis/stereo projection.
- Frustum corner allocation fix.
