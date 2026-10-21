use std::collections::HashMap;

use flight_entity::Uint8Array;
use flight_importdiagnostics::ImportDiagnostic;

use crate::rive_document::parse_rive_document;

// flight-lint: allow(contract-vocabulary) Rive type keys are source-format varuints
// flight-lint: allow(conform-array) D9 array negotiation: TS Readonly<Uint8Array> maps to the canonical byte slice lane
// flight-lint: allow(conform-params) D24: caller-owned map replaces the structured Map return (user-approved)
pub fn collect_rive_core_type_counts(
    out: &mut HashMap<u64, usize>,
    source: &Uint8Array,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> bool {
    out.clear();
    let Some(document) = parse_rive_document(source, diagnostics) else {
        return false;
    };
    for object in document.objects {
        *out.entry(object.type_key).or_default() += 1;
    }
    return true;
}

// flight-lint: allow(conform-array) D9 array negotiation: TS Readonly<Uint8Array> maps to the canonical byte slice lane
pub fn is_readable_rive(source: &Uint8Array) -> bool {
    return parse_rive_document(source, None).is_some();
}
