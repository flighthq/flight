use crate::{
    SwfMorphBounds, SwfReader, SwfTagParseState, merge_swf_rectangles, read_swf_rectangle,
};

pub fn read_swf_bounded_definition_header(
    body: &mut SwfReader,
    state: &mut SwfTagParseState,
    has_end_bounds: bool,
) -> u32 {
    let character_id = u32::from(body.read_uint16());
    let start_bounds = read_swf_rectangle(body);
    let end_bounds = if has_end_bounds {
        read_swf_rectangle(body)
    } else {
        None
    };
    if !body.valid
        || character_id == 0
        || start_bounds.is_none()
        || (has_end_bounds && end_bounds.is_none())
        || state.defined_characters.contains(&character_id)
    {
        return 0;
    }
    let start_bounds = start_bounds.unwrap();
    state.defined_characters.insert(character_id);
    state.character_bounds.insert(
        character_id,
        end_bounds
            .as_ref()
            .map_or(start_bounds, |end| merge_swf_rectangles(&start_bounds, end)),
    );
    if let Some(end) = end_bounds {
        state.morph_bounds.insert(
            character_id,
            SwfMorphBounds {
                end,
                start: start_bounds,
            },
        );
    }
    return character_id;
}
