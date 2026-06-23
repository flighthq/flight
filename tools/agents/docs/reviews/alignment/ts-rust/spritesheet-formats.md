# TS↔Rust Alignment: @flighthq/spritesheet-formats

**Verdict:** In sync — all 9 exported functions and their option/parsed types map 1:1 (camelCase→snake_case, full type words preserved); the only structural differences are Cargo-idiomatic file grouping and a private Rust-only JSON parser, neither of which is public-surface drift requiring a divergence-map entry.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `parseAsepriteSpritesheet` / `asepriteParse.ts` | `parse_aseprite_spritesheet` / `aseprite/mod.rs` | OK — exact map. |
| `parseAsepriteSpritesheetDocument` / `asepriteParse.ts` | `parse_aseprite_spritesheet_document` / `aseprite/mod.rs` | OK. |
| `serializeAsepriteSpritesheet` / `asepriteSerialize.ts` | `serialize_aseprite_spritesheet` / `aseprite/mod.rs` | OK. `existing?: Partial<AsepriteDocument>` → `existing: Option<&AsepriteDocument>` (correct `?`→`Option`, `Readonly`→`&`). |
| `parseStarlingSpritesheet` / `starlingParse.ts` | `parse_starling_spritesheet` / `starling/mod.rs` | OK. |
| `parseStarlingSpritesheetDocument` / `starlingParse.ts` | `parse_starling_spritesheet_document` / `starling/mod.rs` | OK. |
| `serializeStarlingSpritesheet` / `starlingSerialize.ts` | `serialize_starling_spritesheet` / `starling/mod.rs` | OK. |
| `parseTexturePackerSpritesheet` / `texturePackerParse.ts` | `parse_texture_packer_spritesheet` / `texture_packer/mod.rs` | OK. |
| `parseTexturePackerSpritesheetDocument` / `texturePackerParse.ts` | `parse_texture_packer_spritesheet_document` / `texture_packer/mod.rs` | OK. |
| `serializeTexturePackerSpritesheet` / `texturePackerSerialize.ts` | `serialize_texture_packer_spritesheet` / `texture_packer/mod.rs` | OK. |
| `AsepriteParsed`, `AsepriteSerializeOptions` (types) | `AsepriteParsed`, `AsepriteSerializeOptions` | OK — re-exported from `lib.rs`. |
| `StarlingParsed`, `StarlingParseOptions` (types) | `StarlingParsed`, `StarlingParseOptions` | OK. |
| `TexturePackerParsed`, `TexturePackerSerializeOptions` (types) | `TexturePackerParsed`, `TexturePackerSerializeOptions` | OK. |
| `*Schema.ts` interfaces (e.g. `AsepriteDocument`, `AsepriteMeta`) | `aseprite/schema.rs` etc. | OK — schema types track 1:1; basename `schema` tracks TS `*Schema`. |
| `AsepriteSerializeVariant`, `TexturePackerSerializeVariant` enums | same names | Rust-internal enum surfacing the variant the TS side encodes implicitly via the `Partial` doc shape. Exported but harmless; not drift. |
| (no TS equivalent — `JSON.parse`) | `JsonValue` / `parse_json` in `json.rs` | Rust-only internal. Module is **private** (`mod json;`, not `pub`), so it is not public API. Justified: Rust std has no JSON; TS uses the host `JSON`. No divergence-map entry needed. |

### File-layout note (nice-to-have, not a defect)

TS splits each format across three aspect files (`<format>Parse.ts`, `<format>Schema.ts`, `<format>Serialize.ts`); Rust groups each format into a module directory (`<format>/mod.rs` + `<format>/schema.rs`) with a shared private `json.rs`. The Rust basenames (`<format>`, `schema`) still track the TS domain/object names; the per-aspect parse/serialize split collapses into `mod.rs`, which is idiomatic Cargo. Acceptable; no action.

## In sync

- Crate name is identity: `@flighthq/spritesheet-formats` → `flighthq-spritesheet-formats`. No rename, none expected.
- `npm run rust:conformance`: **9 TS / 9 Rust / 0 gaps** for this crate — clean.
- All three formats (Aseprite hash+array, Starling/Sparrow XML, Texture Packer hash+array) parse + serialize + round-trip on both sides.
- Convention carry-over verified: `?`→`Option`, `Readonly<T>`→`&T`, no `out`/`dispose`/`acquire` verbs in this package (value-in / string-out leaf), sentinel use n/a.
- Single dependency `@flighthq/spritesheet` → `flighthq-spritesheet` matches on both sides.
- No divergence-map entry exists or is needed; nothing here is silent drift.
