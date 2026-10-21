# flight-particles-formats

Detection, parsing and serialization for the built-in particle formats: libGDX 2D Particle Editor
(`.p`), Particle Designer plist, Starling/Sparrow PEX, Unity Shuriken JSON, Pixi.js
(pixi-particle-emitter) JSON, and Spine 4.x particle JSON. Pure text/JSON/XML over the canonical
`ParticleEmitterConfig`; no file, network, native or particle-engine work lives here.

- The format registry is caller-owned state (D5): `create_particle_format_registry`,
  `register_particle_format`, `unregister_particle_format`, ordered detection with last-write-wins
  replacement that keeps the kind's original position, and the explicit
  `register_built_in_particle_formats` / `apply_particle_import_options` install step. Importing
  anything installs nothing.
- `detect_particle_format` and `parse_particle_config` route through the registered codecs;
  `parse_particle_config_document` adds the detected format and structured import diagnostics.
- Every per-format parser has a `*_document` form that preserves the source document for round-trip
  serialization; each serializer reports features the target format cannot represent as warnings.
  Pixi is parse-only, as in the source.
- Diagnostics preserve the source kinds, severities, origins and detail keys.

## Precision

`f64` is used only at the serde_json boundary (JSON numbers are f64); every such use is marked in
source with the reason. The particle config lane itself is f32 (D1).
