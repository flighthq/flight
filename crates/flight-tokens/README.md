# flight-tokens

Explicit mode resolution and substitution for flight document scene tokens (TS `@flighthq/tokens`).

A scene's token table is resolved for one mode through an open per-kind resolver registry. The resulting values are then substituted into the scene's node fields, producing a new scene entry that is ready to materialize.

## Contract

- `create_flight_document_token_resolver_registry()` / `initialize_flight_document_token_resolver_registry(out)` install the built-in `Boolean`, `Color`, `Number` and `String` kinds. Vendor kinds compose onto `registry.resolvers` with `with_kind_map_entry`; nothing is registered at module scope.
- `resolve_flight_document_scene_tokens(scene, mode, resolvers)` returns every token dereferenced for `mode`. A token without that mode falls back to its `default`, and aliases resolve inside the requested mode. It returns `None` exactly where `explain_flight_document_scene_token_resolution` names the first refusal: an unresolved token or mode, an alias cycle or kind mismatch, a malformed reference, an unregistered kind, or a value the kind refuses. With no registry, every kind is refused.
- `substitute_flight_document_scene_tokens(scene, resolution)` returns a new scene entry of the same dimension with every node-field reference replaced, or `None` exactly where `explain_flight_document_scene_token_substitution` names the refusal. The input scene is never touched.
- `is_flight_document_token_reference`, `read_flight_document_token_reference_key` and `substitute_flight_document_token_value` define what a reference is: `$key`, where `$$` escapes a literal `$` and a key has the plain-scalar shape `[A-Za-z_][A-Za-z0-9_.-]*`. Both resolution and substitution use this one definition.

## Rust mapping

- The source's symbol sentinel `INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE` is `Option::None`. The walker returns `Option<FlightDocumentValue>`, so failure stays distinct from the document's own `FlightDocumentValue::Null`.
- The walker's two seams, `lookup` and `refuse_malformed`, are borrowed `FnMut` closures. Resolution keeps its memo, visiting set and first refusal in a `RefCell` and never holds a borrow across a recursive call.
- The scene parameter is the `FlightDocumentScene` union, and substitution returns the same variant, as the source's generic `T` preserves the dimension.
- The substituted entry carries every scene-level section over: background color or cameras and lights, layouts, and tokens. The source's spread shares those arrays. Rust owns a `Vec` per entry, so it copies the records but keeps what is shared by handle: each layout's tree `Arc` and each light's descriptor `LightRef`.
- Rebuilt nodes carry `kind`, `fields` and `children`, exactly as the source's `{ children, fields, kind }`. Authored `interactive_states` / `transition` on a node are therefore not carried into the substituted scene.
- When two token rows share a key, the later row wins, as the source's `Map.set` does.

## Precision

- Token values are document (JavaScript Number) `f64` values. A `Color` is admitted only as an integer in `0..=0xFFFFFFFF` (packed sRGB RGBA), and a `Number` only when finite.
