# particles-formats — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. Unify dispatch to registry-only -- merge hardcoded if-chain with open registry so built-in codecs self-register.
2. Remove or implement `PhaserParticleFormatKind` ghost in `@flighthq/types`.
3. Update package description (ships 6 formats, names only 3).

## Approved

None.

## Backlog

- Pixi serializer.
- Multi-emitter support.
- Radial emitter mapping.
- Serialize-side warnings.
