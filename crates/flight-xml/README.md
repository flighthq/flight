# flight-xml

Tree-building XML parser and read-only query helpers, sufficient for atlas, plist and similar data formats.

## Precision

- `get_xml_element_attribute_number -> Option<f64>`: TS returns `number`, which is exact for integers up to 2^53; XML formats carry exact integer ids beyond f32's 2^24 (for example 32-bit tile gids with flip flags).
