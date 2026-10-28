use flight_entity::{Kind, NonEntityCreateResult};

/// A dense table indexed by an ordinal already present in the wire format.
#[derive(Clone, Debug, PartialEq)]
pub struct OrdinalTable<T> {
    pub entries: Vec<Option<T>>,
    pub vocabulary: Vec<Kind>,
}

/// Creates an empty dense table with one slot for each vocabulary entry.
pub fn create_ordinal_table<T>(vocabulary: &[Kind]) -> NonEntityCreateResult<OrdinalTable<T>> {
    return OrdinalTable {
        entries: (0..vocabulary.len()).map(|_| None).collect(),
        vocabulary: vocabulary.to_vec(),
    };
}

/// Clones a dense table (D23 value type: copy and clone).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn clone_ordinal_table<T: Clone>(source: &OrdinalTable<T>) -> OrdinalTable<T> {
    let mut out = create_ordinal_table(&[]);
    copy_ordinal_table(&mut out, source);
    return out;
}

/// Copies the vocabulary and every slot of `source` into `out`, reusing `out`'s storage.
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn copy_ordinal_table<T: Clone>(out: &mut OrdinalTable<T>, source: &OrdinalTable<T>) {
    out.entries.clone_from(&source.entries);
    out.vocabulary.clone_from(&source.vocabulary);
}

/// Returns the value at `ordinal`, or `None` when the ordinal is outside the dense table.
pub fn get_ordinal_table_entry<T>(table: &OrdinalTable<T>, ordinal: usize) -> Option<&T> {
    return table.entries.get(ordinal).and_then(Option::as_ref);
}
