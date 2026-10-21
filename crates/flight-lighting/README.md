# flight-lighting

Origin-pinned light descriptors, photometric conversions, influence analysis, spherical-harmonic
probes and deterministic forward-light selection. The crate depends only on the color, entity,
geometry and texture contracts; it owns no renderer, GPU resource, light provider or packing
backend.

## Source and export audit

The complete pinned `lighting/src` package is represented by modules for ambient, area,
directional, environment, hemisphere, point and spot lights, plus intensity, analysis, probes,
scene lights and forward selection. The public lane contains the exact 39 functions exported by
the pinned `index.ts`, together with the owned types and constants their signatures require. The
full contract lane additionally exposes initializers and exact enum string tables.

`LightUnit` and `Scene3DForwardLightSelectionReason` are closed enums with exact parse and string
mappings. Light `kind` values remain open strings through the `Light` trait, so an extension light
is not forced into a synthetic closed discriminant. Construction options remain plain D12 data
records; they do not carry entity runtime state or factory behavior.

## Identity and copying

Every descriptor clone receives a fresh entity runtime slot. Owned vectors and lists are copied,
while resource relationships preserve identity: environments share their exact texture reference,
scene collections share their exact light references, and probe grids copy their container and
shape while sharing the exact probe references. Initializers replace prior descriptor state and do
not preserve omitted option values.

## Numeric behavior

All contract numbers use `f32`. Photometric conversions retain the pinned lux, candela, lumen and
unitless anchors. Influence and selection preserve the source's range, decay, layer, priority,
stable-order and family-cap rules, including JavaScript-compatible NaN handling where it affects
spot blending and ranking. Probe evaluation and grid sampling cover normalized SH evaluation,
trilinear interpolation, disabled samples, degenerate axes and clamped coordinates.

`Scene3DLightBlock` and its exact layout constants are data-only. Packing is intentionally absent
because it belongs to the eventual render owner rather than this contract crate.

## Sugar and verification

D18 inherent methods are thin delegates to the free-function contract. The suite contains 68
source-port integration tests and 32 one-method-per-sugar comparisons. It covers construction,
initialization, fresh clone identity, shared reference identity, enum tables, open custom kinds,
photometric round trips, shadow and influence gates, probe projection/interpolation, stable forward
selection, alias-safe output reuse and numeric edge cases.
