# flight-textformat

The approved D8 owner of `FontVariation`, its five standard axis constants,
`TextFormatAlign`, `TextFormatListMarker`, `TextFormat`, and `TextFormatRange`.
The declaration sources are `types/src/FontVariation.ts`, `TextFormat.ts`, and
`TextFormatRange.ts` in the supplied Flight reference export.

All 21 format fields remain optional. Absent fields, explicit false/zero values,
empty strings, empty arrays, and the explicit `none` list marker remain distinct.
Metric values use `f32`; packed sRGB RGBA colors use the full `u32` domain.
Tab stops are plain `Vec<f32>` values, and variations are an ordered
`Vec<FontVariation>` with open string axis tags. These records apply no defaults
or normalization.

The range factory and initializer are mechanically relocated from
`textlayout/src/textFormatRange.ts` to their approved type owner. A range has an
Entity runtime slot, retains the caller's `Ref<TextFormat>`, and stores UTF-16
code-unit offsets as `usize` (D15). Initialization preserves the runtime slot
and assigns the supplied fields without clamping or sorting.

The root exports the declarations, constants, and range factory. The full
`contract` also exports the initializer and D9 enum string tables. The only
D18 method is `TextFormatRange::new`, which delegates to the factory and has an
inline comparison test. Plain records have no invented factories or methods.

There is no source `textformat` package. The conformance resolver selects only
the exact range source file and reads its original package index to preserve
public versus contract export classification. It does not scan neighboring
text layout functions. A tool regression checks that boundary. Four narrow
`conform-extra` markers account for the required D9 union string tables, whose
source declarations have no helper functions.
