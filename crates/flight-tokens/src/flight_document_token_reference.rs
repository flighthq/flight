//! What a token reference IS (TS `flightDocumentTokenReference.ts`), shared by token-value
//! resolution and node-field substitution. Two copies would drift, and the copy that drifted would
//! be whichever a later change forgot.

use flight_entity::{Record, get_record_keys, get_record_value, set_record_value};
use flight_scene_document::FlightDocumentValue;

/// A reference that could not be resolved (TS `INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE`, a symbol).
/// Distinct from `FlightDocumentValue::Null`, which a document may legitimately hold: the walker's
/// result is `Option<FlightDocumentValue>` and this is its `None`.
// flight-lint: allow(conform-params) the source symbol sentinel is Option::None beside the document's own Null
pub const INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE: Option<FlightDocumentValue> = None;

// Token keys and mode names share the codec's plain-scalar shape, so an authored key never needs
// quoting and a reference never needs escaping beyond its sigil.
const REFERENCE_ESCAPE: &str = "$$";
const REFERENCE_SIGIL: &str = "$";

/// Whether `value` is a `$`-prefixed reference scalar (an escaped `$$` literal is not).
pub fn is_flight_document_token_reference(value: &FlightDocumentValue) -> bool {
    return match value {
        FlightDocumentValue::String(text) => {
            text.starts_with(REFERENCE_SIGIL) && !text.starts_with(REFERENCE_ESCAPE)
        }
        _ => false,
    };
}

// The codec's plain-scalar key shape (TS `/^[A-Za-z_][A-Za-z0-9_.-]*$/`).
fn is_token_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    return chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-');
}

/// The token key a reference names, or `None` when the scalar is a malformed reference. A caller
/// must have established that the value IS a reference; a plain string never reaches here. A dotted
/// key is one flat name, not a path.
pub fn read_flight_document_token_reference_key(value: &str) -> Option<String> {
    let key = value.get(REFERENCE_SIGIL.len()..).unwrap_or("");
    return if is_token_key(key) {
        Some(key.to_string())
    } else {
        None
    };
}

/// Walks a value tree and replaces every reference through `lookup`, which owns both the mapping
/// from key to value and the refusal it records when there is none. Returns
/// `INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE` (`None`) rather than `Null`, because `Null` is itself a
/// representable document value. A malformed reference is reported through `refuse_malformed` with
/// its path, and the walk stops at the first failure.
// flight-lint: allow(contract-vocabulary) the source's two walker seams are caller closures borrowed for the walk
pub fn substitute_flight_document_token_value(
    value: &FlightDocumentValue,
    path: &str,
    lookup: &mut dyn FnMut(&str, &str) -> Option<FlightDocumentValue>,
    refuse_malformed: &mut dyn FnMut(&str),
) -> Option<FlightDocumentValue> {
    return match value {
        FlightDocumentValue::String(text) => {
            if text.starts_with(REFERENCE_ESCAPE) {
                return Some(FlightDocumentValue::String(
                    text[REFERENCE_SIGIL.len()..].to_string(),
                ));
            }
            if !is_flight_document_token_reference(value) {
                return Some(value.clone());
            }
            let Some(key) = read_flight_document_token_reference_key(text) else {
                refuse_malformed(path);
                return INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE;
            };
            lookup(&key, path)
        }
        FlightDocumentValue::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for (index, item) in items.iter().enumerate() {
                let item_path = format!("{}[{}]", path, index);
                let substituted = substitute_flight_document_token_value(
                    item,
                    &item_path,
                    lookup,
                    refuse_malformed,
                )?;
                out.push(substituted);
            }
            Some(FlightDocumentValue::Array(out))
        }
        FlightDocumentValue::Fields(fields) => {
            let mut keys = Vec::new();
            get_record_keys(&mut keys, fields);
            let mut out: Record<FlightDocumentValue> = Record::default();
            for key in keys {
                let item = get_record_value(fields, &key).expect("a listed record key");
                let item_path = format!("{}.{}", path, key);
                let substituted = substitute_flight_document_token_value(
                    item,
                    &item_path,
                    lookup,
                    refuse_malformed,
                )?;
                set_record_value(&mut out, key, substituted);
            }
            Some(FlightDocumentValue::Fields(out))
        }
        FlightDocumentValue::Boolean(_)
        | FlightDocumentValue::Null
        | FlightDocumentValue::Number(_) => Some(value.clone()),
    };
}
