# flight-font

Portable font contracts and helpers. This crate owns font resources, font-loading and glyph-rasterizer
host seams, outline metrics and sources, font variation axes, and the glyph rasterization records shared
with atlas consumers.

`create_font_resource()` allocates an unloaded entity with an empty family and no face. Assign
`resource.family` before calling a font-loading operation. `initialize_font_resource(out)` is the
construction initializer for preallocated storage and preserves its entity identity and runtime.

The outline adapter is deliberately host-independent. It maps Unicode code points through a bound
`GlyphOutlineSource`, scales design-unit paths to the requested em size, and rasterizes RGBA coverage
with the pinned 4×4 sampling rule. It performs no native font installation or platform rendering.
