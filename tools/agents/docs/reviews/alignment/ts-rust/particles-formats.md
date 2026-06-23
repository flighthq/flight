# TS↔Rust Alignment: @flighthq/particles-formats

**Verdict:** In sync on the public API seam — all 9 TS functions port 1:1 (snake_case, full type words preserved) and every TS document/option/schema type has a Rust counterpart; only minor barrel-symmetry and filename-tracking gaps remain, none requiring a divergence-map entry.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `parse*` / `serialize*` (9 fns) | same 9, snake_case | In sync — `parseParticleDesignerPlist` → `parse_particle_designer_plist`, `parseSpineParticleDocument` → `parse_spine_particle_document`, `serializeUnityParticle` → `serialize_unity_particle`, etc. `rust:conformance` reports 9 TS / 9 matched / 0 missing. |
| `UnityCurveKey` (exported from `unitySchema.ts`, reachable from barrel) | `UnityCurveKey` (`pub struct` in `unity/mod.rs`, NOT in lib.rs `pub use`) | Minor barrel-symmetry gap: reachable only via `unity::UnityCurveKey`, not the crate root. TS re-exports it from the package root via `export *`. Add it to the `pub use unity::{…}` list for parity. |
| `ParticleDesignerRawDict` (`= Record<string, string\|number\|boolean>`, exported from `particleDesignerSchema.ts`) | none | TS exports this alias; Rust has no equivalent (the plist dict is handled internally without a named public type). It is effectively an internal helper alias; safe to leave unported but worth noting it crosses the barrel in TS. |
| inline unions: `ParticleDesignerEmitterType` (`0\|1`), `SpineBlendMode`, `SpineParticleDocument.spawnShape` (`'point'\|'ellipse'\|'line'`), `UnityParticleShapeType`, `UnityMinMaxValue.mode` (`'constant'\|…`) | named enums: `ParticleDesignerEmitterType`, `SpineBlendMode`, `SpineSpawnShape`, `UnityParticleShapeType`, `UnityMinMaxMode` | Idiomatic Rust extraction of TS string/number unions into named enums. `SpineSpawnShape` and `UnityMinMaxMode` are Rust-only _names_ for unions that are inline in TS — expected, not drift. No map entry needed. |
| files: `particleDesignerParse.ts` / `particleDesignerSchema.ts` / `particleDesignerSerialize.ts` (× 3 formats = 9 files) | one `particle_designer/mod.rs` (+ `spine/mod.rs`, `unity/mod.rs`) | Filename-tracking divergence: Rust collapses the TS parse/schema/serialize triad per format into a single module dir, so no Rust basename tracks `*Parse` / `*Schema` / `*Serialize`. Nice-to-have only; the symbol-level seam is unaffected. |
| (none — TS uses runtime `JSON.parse` + hand-rolled plist) | `json.rs` (`mod json;`, internal) | Rust-only internal JSON parser/writer (`parse_json`, `JsonObjectWriter`, `format_json_number`, `escape_json_string`). Environmental: Rust std has no JSON. Not `pub` at the crate root, so it is not part of the public seam — expected, no map entry warranted. |

## In sync

- **Crate name** is identity: `@flighthq/particles-formats` → `flighthq-particles-formats`. No rename.
- **All 9 exported functions** map 1:1 with correct snake_case and full, unabbreviated type words. `rust:conformance` row: `particles-formats | 9 | 9 | 56 | 0` (0 missing).
- **Document + option + parsed types** all present: `ParticleDesignerDocument` / `ParticleDesignerParseOptions` / `ParticleDesignerParsed` / `ParticleDesignerSerializeOptions`; `SpineParticleDocument` / `SpineParsed` / `SpineRangeValue` / `SpineAlphaKeyframe` / `SpineTintKeyframe`; `UnityParticleDocument` / `UnityParseOptions` / `UnityParsed` / `UnitySerializeOptions` plus the full Unity sub-type set (`UnityColor`, `UnityMinMaxValue`, `UnityBurst`, `UnityEmission`, `UnityShape`, `UnityGradient`, `UnityAnimationCurve`, `UnityColorOverLifetime`, `UnitySizeOverLifetime`, `UnityRotationOverLifetime`, etc.).
- **Sentinel/teardown conventions**: no teardown verbs, out-params, or `null` sentinels in this value-in/value-out format crate; TS `parse*` throwing/returning is mirrored by Rust `Result<…, String>`, the standard parse-failure shape. Consistent across both.
- **Dependency edge**: TS depends on `@flighthq/particles` (for `ParticleEmitterConfig`); Rust `Cargo.toml` carries `flighthq-particles` + `flighthq-types`. Matches.

### Suggested divergence-map note

Nothing here rises to a _required_ map entry — the function seam is clean. If the map ever records type-level nuance, the one item worth a line is the **Rust-internal `json.rs`** (Rust-only because std lacks JSON), so a future audit does not flag it as an extra public symbol. The `UnityCurveKey` barrel omission should simply be fixed (add to `pub use`) rather than recorded as a divergence.
