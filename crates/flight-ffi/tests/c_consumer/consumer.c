/*
 * Reference C consumer of the flight-ffi C ABI. It includes the header flight-ffi generates,
 * links the flight-ffi static library, and exercises each calling convention the generated surface
 * produces: scalar values, opaque boxed handles with field accessors and out parameters, borrowed
 * input strings, owned output strings released through the matching flight_free_* function, and
 * async completion callbacks.
 * Entity types are opaque to C; only their `void *` handles cross the boundary.
 */
#include "flight_ffi.h"

#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static int failures = 0;

static void expect(bool condition, const char *description) {
  if (!condition) {
    fprintf(stderr, "FAIL: %s\n", description);
    failures += 1;
  }
}

static bool near(float actual, float expected) {
  return fabsf(actual - expected) < 1e-5f;
}

static void check_scalars(void) {
  expect(flight_lerp_color(0x112233ffu, 0xccddeeffu, 0.0f) == 0x112233ffu, "lerp_color at t=0 returns start");
  expect(flight_lerp_color(0x112233ffu, 0xccddeeffu, 1.0f) == 0xccddeeffu, "lerp_color at t=1 returns end");
}

static void check_handles(void) {
  void *a = flight_create_rectangle(0.0f, 0.0f, 10.0f, 20.0f);
  void *b = flight_create_rectangle(5.0f, 5.0f, 10.0f, 10.0f);
  void *out = flight_create_rectangle(0.0f, 0.0f, 0.0f, 0.0f);
  void *expected = flight_create_rectangle(5.0f, 5.0f, 5.0f, 10.0f);
  expect(a != NULL && b != NULL && out != NULL && expected != NULL, "create_rectangle returns handles");

  expect(near(flight_get_rectangle_bottom(a), 20.0f), "get_rectangle_bottom reads y + height");
  expect(flight_contains_rectangle_point_xy(a, 5.0f, 5.0f), "contains_rectangle_point_xy inside");
  expect(!flight_contains_rectangle_point_xy(a, 50.0f, 5.0f), "contains_rectangle_point_xy outside");

  flight_compute_rectangle_intersection(out, a, b);
  expect(flight_equals_rectangle(out, expected), "compute_rectangle_intersection writes the out handle");
  expect(!flight_equals_rectangle(out, NULL), "equals_rectangle treats NULL as absent");

  expect(near(flight_set_rectangle_x(out, 7.5f), 7.5f), "set_rectangle_x returns the written value");
  expect(near(flight_get_rectangle_x(out), 7.5f), "get_rectangle_x reads the written field");

  flight_free_rectangle(expected);
  flight_free_rectangle(out);
  flight_free_rectangle(b);
  flight_free_rectangle(a);
  flight_free_rectangle(NULL);
}

static void check_strings(void) {
  char *mime = flight_infer_audio_mime_type("music/theme.mp3?version=2");
  expect(mime != NULL && strcmp(mime, "audio/mpeg") == 0, "infer_audio_mime_type returns an owned string");
  flight_free_string(mime);

  char *unknown = flight_infer_audio_mime_type("notes.txt");
  expect(unknown == NULL, "infer_audio_mime_type returns NULL for None");
  flight_free_string(unknown);
}

static void check_owned_byte_readers(void) {
  void *empty = flight_create_byte_reader(NULL, 0, -1);
  expect(empty != NULL && !flight_has_byte_reader_bytes(empty, 1),
         "create_byte_reader accepts NULL with zero length");
  flight_free_owned_byte_reader(empty);

  uint8_t bytes[] = {0x11, 0x34, 0x12, 0x12, 0x34, 0x56};
  void *reader = flight_create_byte_reader(bytes, 6, -1);
  expect(reader != NULL, "create_byte_reader returns an owned reader");
  bytes[0] = 0xff;
  expect(flight_read_byte_reader_u8(reader) == 0x11, "the reader copied its source bytes");
  expect(flight_read_byte_reader_u16(reader) == 0x1234, "mutable reads write the little-endian cursor back");
  expect(flight_read_byte_reader_u24_big_endian(reader) == 0x123456, "the reader preserves big-endian reads");
  expect(!flight_has_byte_reader_bytes(reader, 1), "successive reads share one cursor");
  flight_free_owned_byte_reader(reader);

  uint8_t string_bytes[] = {4, 'c', 'a', 't'};
  reader = flight_create_spine_binary_reader(string_bytes, 4);
  string_bytes[1] = 'r';
  char *text = flight_read_spine_binary_string(reader);
  expect(text != NULL && strcmp(text, "cat") == 0, "the Spine reader returns an owned string from copied bytes");
  flight_free_string(text);
  expect(flight_read_spine_binary_int(reader) == 0, "a Spine overrun reads the documented sentinel");
  expect(flight_is_spine_binary_reader_overrun(reader), "a Spine overrun survives cursor writeback");
  flight_free_owned_byte_reader(reader);
  flight_free_owned_byte_reader(NULL);
}

struct gaussian_samples {
  double values[2];
  int index;
};

static double gaussian_sample(void *context) {
  struct gaussian_samples *samples = context;
  double sample = samples->values[samples->index];
  samples->index = (samples->index + 1) % 2;
  return sample;
}

static void check_tuple_execution(void) {
  struct gaussian_samples samples = {{0.60653066, 0.0}, 0};
  double first = -1.0;
  double second = -1.0;
  flight_random_gaussian_pair(gaussian_sample, &samples, 0.0, 1.0, &first, &second);
  expect(fabs(first - 1.0) < 1e-5 && fabs(second) < 1e-5,
         "random_gaussian_pair writes both tuple outputs");
}

static void check_effect_metadata_snapshots(void) {
  void *kinds = flight_get_effect_kinds();
  size_t count = flight_get_effect_kinds_result_len(kinds);
  expect(count > 1, "get_effect_kinds returns an owned ordered snapshot");
  char *first = flight_get_effect_kinds_result_get(kinds, 0);
  expect(first != NULL && strcmp(first, "AutoExposureEffect") == 0, "the effect kind snapshot preserves source order");
  expect(flight_get_effect_kinds_result_get(kinds, count) == NULL, "an out-of-range effect kind reads NULL");
  flight_get_effect_kinds_result_free(kinds);
  expect(first != NULL && strcmp(first, "AutoExposureEffect") == 0, "an effect kind string outlives its snapshot");
  flight_free_string(first);
  flight_get_effect_kinds_result_free(NULL);
}

static void check_string_arrays(void) {
  void (*set_redaction_paths)(void *, const char *const *, size_t) = flight_set_log_redaction_paths;
  (void)set_redaction_paths;
  const char *segments[] = {"/a/b", "../c"};
  char *joined = flight_join_file_path(segments, 2);
  expect(joined != NULL && strcmp(joined, "/a/c") == 0, "join_file_path reads a C string array");
  flight_free_string(joined);

  char *empty = flight_join_file_path(NULL, 0);
  expect(empty != NULL && strcmp(empty, ".") == 0, "join_file_path accepts an empty NULL array");
  flight_free_string(empty);
}

static bool take_string_equals(char *text, const char *expected) {
  bool equal = text != NULL && strcmp(text, expected) == 0;
  flight_free_string(text);
  return equal;
}

static void check_import_diagnostic_lists(void) {
  const char *cocos = "<plist><dict><key>frames</key><dict><key>a.png</key><dict></dict></dict></dict></plist>";
  /* NULL collects nothing; the parse still returns its owned result. */
  void *data = flight_parse_cocos_plist_spritesheet(cocos, NULL);
  expect(data != NULL, "a NULL diagnostics list still parses");
  flight_free_spritesheet_data(data);

  void *list = flight_create_import_diagnostic_list();
  expect(list != NULL && flight_get_import_diagnostic_list_length(list) == 0, "a new list is empty");
  data = flight_parse_cocos_plist_spritesheet(cocos, list);
  flight_free_spritesheet_data(data);
  data = flight_parse_cocos_plist_spritesheet(cocos, list);
  flight_free_spritesheet_data(data);
  expect(flight_get_import_diagnostic_list_length(list) == 2, "each call appends its diagnostics");
  expect(flight_get_import_diagnostic_list_severity(list, 0) == 0, "a dropped frame has Drop severity");
  expect(take_string_equals(flight_get_import_diagnostic_list_kind(list, 0), "spritesheet.cocos-plist.unrecognized-frame"),
         "kind is an owned string");
  expect(take_string_equals(flight_get_import_diagnostic_list_origin(list, 0), "parseCocosPlistXml"),
         "origin is an owned string");
  expect(take_string_equals(flight_get_import_diagnostic_list_message(list, 0),
                            "Drop parseCocosPlistXml: spritesheet.cocos-plist.unrecognized-frame frame=a.png"),
         "message is the formatted diagnostic");
  expect(flight_get_import_diagnostic_list_detail_length(list, 0) == 1, "the dropped frame carries one detail");
  expect(take_string_equals(flight_get_import_diagnostic_list_detail_key(list, 0, 0), "frame"), "detail key");
  expect(flight_get_import_diagnostic_list_detail_kind(list, 0, 0) == 2, "detail kind 2 is a string");
  expect(take_string_equals(flight_get_import_diagnostic_list_detail_string(list, 0, 0), "a.png"), "detail string");
  expect(isnan(flight_get_import_diagnostic_list_detail_number(list, 0, 0)), "a non-number detail reads NaN");
  expect(flight_get_import_diagnostic_list_severity(list, 1) == 0, "the second dropped frame appends its severity");
  expect(flight_get_import_diagnostic_list_detail_length(list, 1) == 1, "the second diagnostic keeps its detail");
  expect(flight_get_import_diagnostic_list_severity(list, 2) == -1, "an index past the end reads -1");
  expect(flight_get_import_diagnostic_list_kind(list, 2) == NULL, "an index past the end reads NULL");

  flight_clear_import_diagnostic_list(list);
  expect(flight_get_import_diagnostic_list_length(list) == 0, "clear empties the list for reuse");

  /* A live handle of another type is no list: nothing collects into it, reads are empty, and clear and
     destroy leave it intact for its own helpers to read and release. */
  void *windows = flight_vec_ref_app_window_create();
  data = flight_parse_cocos_plist_spritesheet(cocos, windows);
  expect(data != NULL, "a parse with another handle type as diagnostics still returns its result");
  flight_free_spritesheet_data(data);
  flight_clear_import_diagnostic_list(windows);
  expect(flight_get_import_diagnostic_list_length(windows) == 0, "another handle type reads as an empty list");
  expect(flight_get_import_diagnostic_list_severity(windows, 0) == -1, "another handle type reads severity -1");
  expect(flight_get_import_diagnostic_list_message(windows, 0) == NULL, "another handle type reads no message");
  flight_destroy_import_diagnostic_list(windows);
  expect(flight_vec_ref_app_window_len(windows) == 0, "another handle type survives list clear and destroy");
  expect(flight_vec_ref_app_window_get(windows, 0) == NULL, "another handle type keeps its own empty contents");
  flight_vec_ref_app_window_free(windows);
  flight_destroy_import_diagnostic_list(list);
  flight_destroy_import_diagnostic_list(NULL);
  expect(flight_get_import_diagnostic_list_length(NULL) == 0, "a NULL list reads empty");
}

static void check_non_entity_create_results(void) {
  void *insets = flight_create_safe_area_insets();
  expect(insets != NULL, "create_safe_area_insets returns a struct handle");
  expect(near(flight_get_safe_area_insets_top(insets), 0.0f), "create_safe_area_insets starts zeroed");
  expect(near(flight_set_safe_area_insets_left(insets, 12.0f), 12.0f), "set_safe_area_insets_left writes");
  expect(near(flight_get_safe_area_insets_left(insets), 12.0f), "get_safe_area_insets_left reads back");
  flight_free_safe_area_insets(insets);

  /* A Ref-returning create owns one boxed Arc handle. It is usable by Ref-accepting functions and
     released through the Ref-specific free, rather than the free for a boxed MenuItemTemplate. */
  void *edit_menu = flight_create_default_edit_menu_template();
  expect(edit_menu != NULL, "create_default_edit_menu_template returns a Ref handle");
  char *problem = flight_validate_menu_item_template(edit_menu);
  expect(problem == NULL, "the default edit menu template validates");
  flight_free_string(problem);
  flight_free_menu_item_template_ref(edit_menu);
  flight_free_menu_item_template_ref(NULL);
}

static void check_shared_values(void) {
  /* An Arc<Vec<TimelineLabel>> return is an owned copy read through the Vec result helpers. */
  void *timeline = flight_create_timeline(NULL);
  void *labels = flight_get_timeline_labels(timeline);
  expect(labels != NULL, "get_timeline_labels returns an owned list");
  expect(flight_get_timeline_labels_result_len(labels) == 0, "a timeline without a source has no labels");
  expect(flight_get_timeline_labels_result_get(labels, 0) == NULL, "an out-of-range label reads NULL");
  flight_get_timeline_labels_result_free(labels);
  flight_get_timeline_labels_result_free(NULL);
  flight_free_timeline_ref(timeline);
}

static void check_slice_carriers(void) {
  /* Scalar lists pass as (lists, lengths, count) and are copied for the call. */
  const double square[8] = {0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0};
  const void *const contours[1] = {square};
  const size_t lengths[1] = {8};
  void *region = flight_create_clip_region_from_contours(contours, (void *)lengths, 1, 0);
  expect(flight_clip_region_contains_point(region, 5.0, 5.0), "a contour clip region contains its interior");
  expect(!flight_clip_region_contains_point(region, 15.0, 5.0), "a contour clip region excludes its exterior");
  flight_free_clip_region_ref(region);

  /* A nested list return is read one inner list at a time and freed once. */
  void *path = flight_create_path(-1);
  flight_append_path_rectangle(path, 0.0, 0.0, 4.0, 2.0);
  void *flattened = flight_flatten_path(path, 0.25);
  expect(flight_flatten_path_result_len(flattened) == 1, "flatten_path returns one contour for a rectangle");
  expect(flight_flatten_path_result_get_len(flattened, 0) >= 8, "the flattened rectangle has every corner");
  expect(flight_flatten_path_result_get(flattened, 0) != NULL, "a non-empty contour has a base pointer");
  expect(flight_flatten_path_result_get(flattened, 1) == NULL, "an out-of-range contour reads NULL");
  flight_flatten_path_result_free(flattened);
  flight_free_path_ref(path);

  /* Fixed-array elements pass as a pointer array; the fixed-array result has a typed free. */
  float identity[20] = {0};
  identity[0] = identity[6] = identity[12] = identity[18] = 1.0f;
  const void *const matrices[2] = {identity, identity};
  float *fused = flight_fuse_color_matrices(matrices, 2);
  expect(near(fused[0], 1.0f) && near(fused[1], 0.0f), "fusing identities yields identity");
  flight_free_f32_array_20(fused);

  /* A fixed array of structs is written into the caller's handle array. */
  void *bitmap = flight_create_bitmap(1, 1, 0x11223344);
  void *channels[4] = {NULL, NULL, NULL, NULL};
  flight_split_bitmap_channels(bitmap, channels);
  for (int index = 0; index < 4; index++) {
    expect(channels[index] != NULL, "split_bitmap_channels writes every channel");
    flight_free_bitmap_ref(channels[index]);
  }
  flight_split_bitmap_channels(bitmap, NULL);
  flight_free_bitmap_ref(bitmap);
}

static void check_outcome_results(void) {
  /* A NULL outcome handle reads as no outcome through every helper. */
  expect(flight_get_midi_access_input_ports_result_reason(NULL) == -1, "a NULL ports outcome has no reason");
  expect(!flight_get_midi_access_input_ports_result_has_ports(NULL), "a NULL ports outcome has no ports");
  expect(flight_get_midi_access_input_ports_result_len(NULL) == 0, "a NULL ports outcome is empty");
  expect(flight_get_midi_access_input_ports_result_get(NULL, 0) == NULL, "a NULL ports outcome reads NULL");
  flight_get_midi_access_output_ports_result_free(NULL);
  flight_free_midi_input_port_ref(NULL);
  flight_free_midi_output_port_ref(NULL);
}

static void check_typed_array_refs(void) {
  /* A typed array Ref handle shares its buffer: a resource built from it reads the same samples. */
  const float samples[3] = {0.25f, -0.5f, 1.0f};
  void *channel = flight_create_float32_array_ref((void *)samples, 3);
  expect(flight_get_float32_array_ref_length(channel) == 3, "create_float32_array_ref copies every sample");
  const void *const channels[1] = {channel};
  void *resource = flight_create_audio_resource_from_samples(channels, 1, 8000.0f);
  void *data = flight_get_audio_resource_channel_data(resource, 0);
  float read[3] = {0.0f, 0.0f, 0.0f};
  expect(flight_read_float32_array_ref(data, 0, read, 3) == 3, "channel data reads every sample");
  expect(near(read[1], -0.5f), "channel data matches the samples");
  expect(flight_get_audio_resource_channel_data(resource, -1) == NULL, "a missing channel reads NULL");
  flight_free_float32_array_ref(data);
  flight_free_audio_resource_ref(resource);
  flight_free_float32_array_ref(channel);
  flight_free_float32_array_ref(NULL);
  expect(flight_get_uint8_array_ref_length(NULL) == 0, "a NULL typed array Ref is empty");
}

static void check_string_maps(void) {
  void *record = flight_parse_xml_attributes("width=\"4\" height=\"2\"");
  expect(flight_parse_xml_attributes_result_len(record) == 2, "parse_xml_attributes reads both attributes");
  char *key = flight_parse_xml_attributes_result_get_key(record, 0);
  expect(key != NULL && strcmp(key, "width") == 0, "attribute keys keep source order");
  flight_free_string(key);
  char *height = flight_parse_xml_attributes_result_get(record, "height");
  expect(height != NULL && strcmp(height, "2") == 0, "attributes read by key");
  flight_free_string(height);
  expect(flight_parse_xml_attributes_result_get(record, "depth") == NULL, "a missing attribute reads NULL");
  flight_parse_xml_attributes_result_free(record);

  void *counts = flight_create_string_count_map();
  expect(flight_collect_svg_counts(counts, "<svg><rect/><rect/></svg>"), "collect_svg_counts fills a count map");
  expect(flight_get_string_count_map_length(counts) > 0, "the count map has element kinds");
  char *kind = flight_get_string_count_map_key(counts, 0);
  expect(kind != NULL && flight_get_string_count_map_value(counts, kind) > 0, "each counted kind has a count");
  flight_free_string(kind);
  expect(flight_get_string_count_map_value(counts, "missing") == -1, "a missing count reads -1");
  flight_clear_string_count_map(counts);
  expect(flight_get_string_count_map_length(counts) == 0, "clear empties the count map");
  flight_destroy_string_count_map(counts);
  expect(!flight_collect_svg_counts(NULL, "<svg/>"), "a NULL count map collects nothing");
  flight_destroy_string_count_map(NULL);

  void *regions = flight_create_texture_atlas_region_map();
  expect(flight_get_texture_atlas_region_map_length(regions) == 0, "a new region map is empty");
  expect(flight_get_texture_atlas_region_map_value(regions, "walk") == NULL, "a missing region reads NULL");
  expect(flight_get_texture_atlas_region_map_key(regions, 0) == NULL, "an out-of-range region key reads NULL");
  flight_destroy_texture_atlas_region_map(regions);
  void *pages = flight_create_optional_texture_atlas_list();
  expect(flight_get_optional_texture_atlas_list_item(pages, 0) == NULL, "an out-of-range page reads NULL");
  flight_destroy_optional_texture_atlas_list(pages);
  flight_free_texture_atlas_ref(NULL);
  flight_free_texture_atlas_region_ref(NULL);
  const uint8_t rive[16] = {0x52, 0x49, 0x56, 0x45, 7, 0, 0, 0, 3, 0, 12, 0, 12, 0, 7, 0};
  void *type_counts = flight_create_u64_count_map();
  expect(flight_collect_rive_core_type_counts(type_counts, (void *)rive, 16, NULL), "collect_rive_core_type_counts reads a Rive file");
  uint64_t first_type = 0;
  expect(flight_get_u64_count_map_key(type_counts, 0, &first_type) && first_type == 3, "type keys read in ascending order");
  expect(flight_get_u64_count_map_value(type_counts, 12) == 2, "each core type is counted");
  expect(!flight_get_u64_count_map_key(type_counts, 3, &first_type), "an out-of-range type key reads false");
  flight_destroy_u64_count_map(type_counts);
  flight_destroy_u64_count_map(NULL);
  expect(!flight_call_disposer(NULL), "a NULL disposer does not run");
  flight_free_disposer(NULL);

  /* A NULL storage batch result reads as no result through every typed accessor. */
  expect(!flight_is_storage_set_items_result_ok(NULL), "a NULL storage batch result is not ok");
  expect(flight_get_storage_set_items_result_completed(NULL) == 0, "a NULL storage batch result completed nothing");
  expect(flight_get_storage_set_items_result_failed_key(NULL) == NULL, "a NULL storage batch result has no failed key");
  expect(flight_get_storage_set_items_result_reason(NULL) == -1, "a NULL storage batch result has no reason");
  flight_free_storage_set_items_result(NULL);
}

static void check_task_k_opaque_ownership(void) {
  /* Task K transfers an owned opaque map to C with typed accessors and one paired free. */
  void *record = flight_serialize_log_error("task-k-error");
  expect(record != NULL, "serialize_log_error transfers an owned map handle");
  expect(flight_serialize_log_error_result_len(record) == 1, "the serialized error map has one entry");
  char *key = flight_serialize_log_error_result_get_key(record, 0);
  expect(key != NULL && strcmp(key, "value") == 0, "the serialized error map exposes an owned key");
  expect(flight_serialize_log_error_result_get(record, "value") != NULL,
         "the serialized error map exposes its borrowed value");
  expect(flight_serialize_log_error_result_get(record, "missing") == NULL,
         "a missing serialized error field reads NULL");
  flight_serialize_log_error_result_free(record);
  expect(key != NULL && strcmp(key, "value") == 0, "an owned map key outlives its result handle");
  flight_free_string(key);
  expect(flight_serialize_log_error_result_len(NULL) == 0, "a NULL serialized error map is empty");
  expect(flight_serialize_log_error_result_get(NULL, "value") == NULL,
         "a NULL serialized error map has no values");
  expect(flight_serialize_log_error_result_get_key(NULL, 0) == NULL,
         "a NULL serialized error map has no keys");
  flight_serialize_log_error_result_free(NULL);

  /* A producer-created Task K handle belongs to C until its named paired free. */
  void *registry = flight_create_markup_tag_registry();
  expect(registry != NULL, "create_markup_tag_registry transfers an owned handle");
  flight_register_standard_markup_tags(registry);
  flight_free_markup_tag_registry(registry);
  flight_free_markup_tag_registry(NULL);
}

static void check_by_value_ownership(void) {
  /* A transferred box belongs to the SDK after the call: the caller neither uses nor frees it. */
  void *vector = flight_create_vector2(1.0f, 2.0f);
  flight_release_vector2(vector);
  void *reused = flight_acquire_vector2();
  expect(reused != NULL, "acquire_vector2 returns a vector after a release");
  flight_free_vector2(reused);

  /* share_bitmap consumes the owned bitmap; only the returned Ref handle is freed afterwards. */
  void *bitmap = flight_create_bitmap(2, 2, 0x11223344);
  void *shared = flight_share_bitmap(bitmap);
  expect(shared != NULL, "share_bitmap returns an owned Ref handle");
  void *region = flight_create_bitmap_region(shared, 0, 0, 1, 1);
  expect(region != NULL, "create_bitmap_region shares the Ref without consuming it");
  flight_free_bitmap_region(region);
  flight_free_bitmap_ref(shared);
}

/* G5: one shared bitmap seen through two regions, written through one and read through the other,
   then flipped in place; regions are freed before the Ref, and the consumed bitmap is never freed. */
static void check_shared_bitmap_regions(void) {
  void *bitmap = flight_create_bitmap(2, 1, 0x000000ff);
  void *shared = flight_share_bitmap(bitmap);
  void *writer = flight_create_bitmap_region(shared, 1, 0, 1, 1);
  void *reader = flight_create_bitmap_region(shared, 0, 0, 2, 1);
  expect(writer != NULL && reader != NULL, "two regions share one bitmap");

  flight_fill_bitmap_rectangle(writer, 0xff8000ff);
  uint8_t pixels[8] = {0};
  flight_extract_bitmap_pixels(pixels, sizeof pixels, reader);
  expect(pixels[0] == 0x00 && pixels[3] == 0xff, "a fill through one region leaves the rest untouched");
  expect(pixels[4] == 0xff && pixels[5] == 0x80 && pixels[6] == 0x00 && pixels[7] == 0xff,
         "a fill through one region is read through the other");

  flight_set_bitmap_region(writer, shared, 0, 0, 2, 1);
  flight_flip_bitmap_horizontal(writer, reader);
  flight_extract_bitmap_pixels(pixels, sizeof pixels, reader);
  expect(pixels[0] == 0xff && pixels[1] == 0x80 && pixels[4] == 0x00 && pixels[7] == 0xff,
         "flip with identical rectangles on one bitmap mirrors in place");

  flight_free_bitmap_region(writer);
  flight_free_bitmap_region(reader);
  flight_free_bitmap_ref(shared);
}

static void check_enum_parameters(void) {
  /* -1 is None for an optional enum; every declared discriminant converts to its variant. */
  const int32_t windings[3] = {-1, 0, 1};
  for (int index = 0; index < 3; index++) {
    void *path = flight_create_path(windings[index]);
    expect(path != NULL, "create_path accepts -1 and each PathWinding discriminant");
    flight_free_path_ref(path);
  }
}
static void check_optional_texture_variants(void) {
  void *texture = flight_create_texture(NULL);
  expect(texture != NULL, "create_texture returns a handle");
  expect(flight_equals_texture__texture__texture(texture, texture), "equals_texture compares a present pair");
  expect(!flight_equals_texture__texture__texture(texture, NULL), "equals_texture treats NULL as an absent texture");
  expect(!flight_equals_texture__texture__texture(NULL, NULL), "equals_texture never equates two absent textures");

  flight_set_texture_source__texture(texture, NULL);
  void *source = flight_get_texture_source__texture(texture);
  expect(source == NULL, "set_texture_source with a NULL source leaves no source");
  flight_free_texture_source_ref(source);
  flight_free_texture_ref(texture);
}

static void check_optional_tuples(void) {
  void *path = flight_create_path(-1);
  double x = -1.0;
  double y = -1.0;
  expect(!flight_get_path_last_point(path, &x, &y), "an empty path has no last point");
  expect(x == -1.0 && y == -1.0, "an absent tuple leaves its outputs untouched");

  flight_append_path_move_to(path, 1.5, 2.5);
  flight_append_path_line_to(path, 3.0, 4.0);
  expect(flight_get_path_last_point(path, &x, &y), "a drawn path has a last point");
  expect(x == 3.0 && y == 4.0, "get_path_last_point writes both outputs");
  expect(flight_get_path_last_point(path, NULL, NULL), "NULL outputs are skipped");
  flight_free_path_ref(path);
}

static void check_unit_signals(void) {
  /* The history and signal values are independent owned Ref handles. */
  void *history = flight_create_command_history();
  expect(history != NULL, "create_command_history returns a Ref handle");
  expect(flight_get_command_history_signals(history) == NULL, "a history starts with no change signal");

  void *enabled = flight_enable_command_history_signals(history);
  expect(enabled != NULL, "enable_command_history_signals returns an owned signal handle");
  void *present = flight_get_command_history_signals(history);
  expect(present != NULL && present != enabled, "get_command_history_signals returns its own handle once enabled");
  flight_free_unit_signal(present);
  flight_free_unit_signal(enabled);
  flight_free_unit_signal(NULL);
  flight_free_command_history_ref(history);
  flight_free_command_history_ref(NULL);
}

struct bool_completion {
  int calls;
  bool value;
  bool had_error;
};

static void complete_bool(void *ctx, bool value, char *error) {
  struct bool_completion *completion = ctx;
  completion->calls += 1;
  completion->value = value;
  completion->had_error = error != NULL;
  flight_free_string(error);
}

static void check_async_callbacks(void) {
  /* create_file_symlink resolves `false` immediately, so the callback runs before the call returns. */
  struct bool_completion completion = {0, true, true};
  flight_create_file_symlink("/a", "/b", complete_bool, &completion);
  expect(completion.calls == 1, "a resolved future completes its callback once, before returning");
  expect(!completion.value, "create_file_symlink settles false");
  expect(!completion.had_error, "a fulfilled future passes a NULL error");
}

struct task_m_color_context {
  int calls;
};

static bool task_m_sample_color(void *context, float t, float *out_rgb) {
  struct task_m_color_context *color = context;
  color->calls += 1;
  out_rgb[0] = t;
  out_rgb[1] = t + 1.0f;
  out_rgb[2] = t + 2.0f;
  return true;
}

static void check_task_m_carriers(void) {
  const uint8_t wav[] = {0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45};
  char *mime = flight_detect_audio_mime_type(wav, sizeof(wav));
  expect(mime != NULL && strcmp(mime, "audio/wav") == 0,
         "Task M lifetime-data carrier borrows an explicitly bounded byte view");
  flight_free_string(mime);

  struct task_m_color_context color = {0};
  void *curve = flight_build_particle_color_curve(task_m_sample_color, &color, 2);
  expect(curve != NULL, "Task M color callback returns an owned collection");
  expect(color.calls == 2, "Task M color callback retains and passes its caller context");
  expect(flight_build_particle_color_curve_result_len(curve) == 6,
         "Task M color collection contains three channels per sample");
  const float *last = flight_build_particle_color_curve_result_get(curve, 5);
  expect(last != NULL && near(*last, 3.0f), "Task M color collection exposes callback output");
  expect(flight_build_particle_color_curve_result_get(curve, 6) == NULL,
         "Task M color collection bounds-checks reads");
  flight_build_particle_color_curve_result_free(curve);
  flight_build_particle_color_curve_result_free(NULL);
}

struct shape_bounds_recording_context {
  int flush_calls;
  bool flush_succeeds;
};

static bool shape_bounds_close_path(void *context) {
  (void)context;
  return true;
}

static bool shape_bounds_cubic_curve_to(void *context, double control_x1, double control_y1, double control_x2,
                                        double control_y2, double x, double y) {
  (void)context;
  (void)control_x1;
  (void)control_y1;
  (void)control_x2;
  (void)control_y2;
  (void)x;
  (void)y;
  return true;
}

static bool shape_bounds_draw_circle(void *context, double center_x, double center_y, double radius) {
  (void)context;
  (void)center_x;
  (void)center_y;
  (void)radius;
  return true;
}

static bool shape_bounds_draw_ellipse(void *context, double center_x, double center_y, double radius_x,
                                      double radius_y) {
  (void)context;
  (void)center_x;
  (void)center_y;
  (void)radius_x;
  (void)radius_y;
  return true;
}

static bool shape_bounds_draw_rectangle(void *context, double x, double y, double width, double height) {
  (void)context;
  (void)x;
  (void)y;
  (void)width;
  (void)height;
  return true;
}

static bool shape_bounds_draw_rounded_rectangle(void *context, double x, double y, double width, double height,
                                                 double radius) {
  (void)context;
  (void)x;
  (void)y;
  (void)width;
  (void)height;
  (void)radius;
  return true;
}

static bool shape_bounds_expand_point(void *context, double x, double y) {
  (void)context;
  (void)x;
  (void)y;
  return true;
}

static bool shape_bounds_flush_path(void *context) {
  struct shape_bounds_recording_context *recording = context;
  recording->flush_calls += 1;
  return recording->flush_succeeds;
}

static bool shape_bounds_line_to(void *context, double x, double y) {
  (void)context;
  (void)x;
  (void)y;
  return true;
}

static bool shape_bounds_move_to(void *context, double x, double y) {
  (void)context;
  (void)x;
  (void)y;
  return true;
}

static bool shape_bounds_quadratic_curve_to(void *context, double control_x, double control_y, double x, double y) {
  (void)context;
  (void)control_x;
  (void)control_y;
  (void)x;
  (void)y;
  return true;
}

static bool shape_bounds_set_stroke_style(void *context, double width, uint32_t caps, uint32_t joints,
                                           double miter_limit) {
  (void)context;
  (void)width;
  (void)caps;
  (void)joints;
  (void)miter_limit;
  return true;
}

static bool shape_bounds_stateless_flush_path(void *context) {
  return context == NULL;
}

static const FlightShapeBoundsContextVTable shape_bounds_vtable = {
    .close_path = shape_bounds_close_path,
    .cubic_curve_to = shape_bounds_cubic_curve_to,
    .draw_circle = shape_bounds_draw_circle,
    .draw_ellipse = shape_bounds_draw_ellipse,
    .draw_rectangle = shape_bounds_draw_rectangle,
    .draw_rounded_rectangle = shape_bounds_draw_rounded_rectangle,
    .expand_point = shape_bounds_expand_point,
    .flush_path = shape_bounds_flush_path,
    .line_to = shape_bounds_line_to,
    .move_to = shape_bounds_move_to,
    .quadratic_curve_to = shape_bounds_quadratic_curve_to,
    .set_stroke_style = shape_bounds_set_stroke_style,
};

static void check_shape_bounds_context(void) {
  bool (*flush)(void *, const FlightShapeBoundsContextVTable *) = flight_default_shape_bounds_flush;
  struct shape_bounds_recording_context recording = {0, true};

  expect(flush(&recording, &shape_bounds_vtable), "a complete ShapeBoundsContext vtable succeeds");
  expect(recording.flush_calls == 1, "ShapeBoundsContext mutation reaches the caller-owned context once");

  recording.flush_calls = 0;
  FlightShapeBoundsContextVTable stateless = shape_bounds_vtable;
  stateless.flush_path = shape_bounds_stateless_flush_path;
  expect(flush(NULL, &stateless), "NULL ShapeBoundsContext user data supports stateless callbacks");
  expect(!flush(&recording, NULL), "a NULL ShapeBoundsContext vtable is rejected");
  expect(recording.flush_calls == 0, "a NULL ShapeBoundsContext vtable cannot invoke a callback");

  FlightShapeBoundsContextVTable incomplete = shape_bounds_vtable;
  incomplete.move_to = NULL;
  expect(!flush(&recording, &incomplete), "every ShapeBoundsContext callback is required up front");
  expect(recording.flush_calls == 0, "an incomplete vtable is rejected before context mutation");

  recording.flush_succeeds = false;
  expect(!flush(&recording, &shape_bounds_vtable), "a ShapeBoundsContext callback can report failure");
  expect(recording.flush_calls == 1, "a failing ShapeBoundsContext callback still runs exactly once");
}

static void check_node_carriers(void) {
  FlightNode *container = flight_create_display_object();
  FlightNode *sprite = flight_create_sprite();
  FlightNode *shape = flight_create_shape();
  FlightNode *bitmap_text = flight_create_bitmap_text(NULL);
  FlightNode *text_label = flight_create_text_label(NULL);
  expect(container != NULL && sprite != NULL && shape != NULL && bitmap_text != NULL && text_label != NULL,
         "all concrete node families use FlightNode");

  uint32_t revision = flight_get_node_local_transform_revision(sprite);
  uint32_t appearance_revision = flight_get_node_appearance_revision(sprite);
  uint32_t bounds_revision = flight_get_node_local_bounds_revision(sprite);
  uint32_t content_revision = flight_get_node_local_content_revision(sprite);
  uint32_t parent_revision = flight_get_node_parent_reference_revision(sprite);
  expect(flight_set_node2d_x(sprite, 9.5f), "Node2DFields writes through FlightNode");
  expect(near(flight_get_node2d_x(sprite), 9.5f), "Node2DFields reads through FlightNode");
  expect(flight_set_node2d_y(sprite, -4.25) && flight_get_node2d_y(sprite) == -4.25,
         "Node2DFields preserves y");
  expect(flight_set_node2d_rotation(sprite, 45.0) && flight_get_node2d_rotation(sprite) == 45.0,
         "Node2DFields preserves rotation");
  expect(flight_set_node2d_scale_x(sprite, 1.5) && flight_get_node2d_scale_x(sprite) == 1.5,
         "Node2DFields preserves scale x");
  expect(flight_set_node2d_scale_y(sprite, 0.75) && flight_get_node2d_scale_y(sprite) == 0.75,
         "Node2DFields preserves scale y");
  expect(flight_set_node2d_alpha(sprite, 0.625f) && near(flight_get_node2d_alpha(sprite), 0.625f),
         "Node2DFields preserves alpha");
  expect(flight_set_node2d_visible(sprite, false) && !flight_get_node2d_visible(sprite),
         "Node2DFields preserves visibility");
  expect(flight_get_node_local_transform_revision(sprite) == revision, "field writes do not implicitly invalidate");
  expect(flight_get_node_appearance_revision(sprite) == appearance_revision,
         "field writes do not implicitly invalidate appearance");
  expect(flight_set_node_enabled_field(sprite, false) && !flight_get_node_enabled(sprite),
         "the collision-only node.enabled field setter writes without invalidation");
  expect(flight_get_node_local_transform_revision(sprite) == revision &&
             flight_get_node_appearance_revision(sprite) == appearance_revision &&
             flight_get_node_local_bounds_revision(sprite) == bounds_revision &&
             flight_get_node_local_content_revision(sprite) == content_revision &&
             flight_get_node_parent_reference_revision(sprite) == parent_revision,
         "the node.enabled field setter leaves every revision unchanged");
  expect(flight_set_node_enabled(sprite, true) && flight_get_node_enabled(sprite),
         "the canonical node enabled SDK verb remains reachable");
  revision += 1;
  appearance_revision += 1;
  bounds_revision += 1;
  content_revision += 1;
  parent_revision += 1;
  expect(flight_get_node_local_transform_revision(sprite) == revision &&
             flight_get_node_appearance_revision(sprite) == appearance_revision &&
             flight_get_node_local_bounds_revision(sprite) == bounds_revision &&
             flight_get_node_local_content_revision(sprite) == content_revision &&
             flight_get_node_parent_reference_revision(sprite) == parent_revision,
         "the canonical node enabled SDK verb invalidates every node revision lane");
  flight_invalidate_node_local_transform(sprite);
  expect(flight_get_node_local_transform_revision(sprite) == revision + 1,
         "explicit node invalidation remains caller controlled");
  flight_invalidate_node_appearance(sprite);
  expect(flight_get_node_appearance_revision(sprite) == appearance_revision + 1,
         "explicit appearance invalidation remains caller controlled");
  appearance_revision += 1;
  expect(flight_set_node2d_clip(sprite, NULL), "the canonical clip SDK verb accepts NULL to clear");
  expect(flight_get_node_appearance_revision(sprite) == appearance_revision + 1,
         "the canonical clip SDK verb invalidates appearance");

  expect(flight_set_node_name(sprite, "c-sprite"), "NodeFields name accepts UTF-8");
  char *name = flight_get_node_name(sprite);
  expect(name != NULL && strcmp(name, "c-sprite") == 0, "NodeFields name returns an owned copy");
  flight_free_string(name);
  expect(flight_set_node_name(sprite, NULL) && flight_get_node_name(sprite) == NULL,
         "NULL clears the optional node name");
  expect(!flight_has_node2d_blend_mode(sprite), "blend mode begins absent");
  expect(flight_set_node2d_blend_mode(sprite, 3, true), "blend mode accepts its integer lane");
  expect(flight_has_node2d_blend_mode(sprite) && flight_get_node2d_blend_mode(sprite) == 3,
         "blend mode preserves value and presence");
  expect(!flight_set_node2d_blend_mode(sprite, 99, true) && flight_get_node2d_blend_mode(sprite) == 3,
         "invalid present blend mode is distinguishable and leaves the value unchanged");
  expect(flight_set_node2d_blend_mode(sprite, 99, false), "absent blend mode ignores its integer lane");
  expect(!flight_has_node2d_blend_mode(sprite) && flight_get_node2d_blend_mode(sprite) == -1,
         "absent blend mode has the documented sentinel");
  expect(flight_get_text_label_string(sprite) == NULL, "a wrong concrete node kind returns its pointer sentinel");

  FlightNode *node3d = flight_create_particle_emitter_3d();
  expect(node3d != NULL, "a 3D node uses the shared FlightNode carrier");
  expect(flight_get_node2d_x(node3d) == 0.0 && !flight_set_node2d_x(node3d, 3.0),
         "a non-2D node returns the documented 2D sentinels");
  uint32_t node3d_appearance = flight_get_node_appearance_revision(node3d);
  expect(flight_set_node3d_alpha(node3d, 0.5f) && near(flight_get_node3d_alpha(node3d), 0.5f),
         "the canonical node3d alpha SDK verb remains reachable");
  expect(flight_get_node_appearance_revision(node3d) == node3d_appearance + 1,
         "the canonical node3d alpha SDK verb invalidates appearance");
  expect(flight_set_node3d_alpha_field(node3d, 0.25f) && near(flight_get_node3d_alpha(node3d), 0.25f),
         "the collision-only node3d alpha field setter remains reachable");
  expect(flight_get_node_appearance_revision(node3d) == node3d_appearance + 1,
         "the node3d alpha field setter does not invalidate");

  FlightNode *added = flight_add_node_child(container, sprite);
  expect(flight_node_equals(added, sprite), "add child returns the inserted node identity");
  flight_free_node(added);
  added = flight_add_node_child_at(container, shape, 0);
  expect(flight_node_equals(added, shape), "add child at returns the inserted node identity");
  flight_free_node(added);

  FlightNodeArray *children = flight_node_array_create();
  expect(flight_node_array_push(children, bitmap_text), "node array accepts bitmap text");
  expect(flight_node_array_len(children) == 1, "one push grows a node array by exactly one");
  expect(flight_node_array_push(children, text_label), "node array accepts text");
  expect(flight_node_array_len(children) == 2, "two pushes produce an exact array length of two");
  flight_add_node_children(container, children);
  flight_free_node_array(children);
  expect(flight_get_node_child_count(container) == 4, "a freed input array leaves retained hierarchy children");

  FlightNode *parent = flight_get_node_parent(sprite);
  expect(flight_node_equals(parent, container), "get parent preserves FlightNode identity");
  expect(flight_set_node2d_x(parent, 27.0) && flight_get_node2d_x(container) == 27.0,
         "an abstract parent view mutates the same allocation");
  flight_free_node(parent);
  FlightNode *root = flight_get_node_root(text_label);
  expect(flight_node_equals(root, container), "get root preserves FlightNode identity");
  expect(flight_get_node2d_x(root) == 27.0, "an abstract root view reads the same allocation");
  flight_free_node(root);

  flight_swap_node_children(container, sprite, shape);
  expect(flight_get_node_child_index(container, sprite) == 0 && flight_get_node_child_index(container, shape) == 1,
         "swap children reorders node handles");

  FlightNodeArray *snapshot = flight_node_array_create();
  flight_get_node_children(snapshot, container);
  expect(flight_node_array_len(snapshot) == 4, "node array receives hierarchy output");
  FlightNode *first = flight_node_array_get(snapshot, 0);
  expect(flight_node_equals(first, sprite), "node array get preserves Arc identity");
  flight_free_node(first);

  FlightNode *recovered_text_label = flight_node_array_get(snapshot, 3);
  flight_set_text_label_string(recovered_text_label, "recovered-text");
  char *recovered_text = flight_get_text_label_string(recovered_text_label);
  expect(recovered_text != NULL && strcmp(recovered_text, "recovered-text") == 0,
         "an erased array element recovers its concrete node kind");
  flight_free_string(recovered_text);
  flight_free_node(recovered_text_label);

  flight_set_node_child_index(container, text_label, 0);
  flight_node_array_clear(snapshot);
  flight_get_node_children(snapshot, container);
  first = flight_node_array_get(snapshot, 0);
  expect(flight_node_equals(first, text_label), "hierarchy reorder preserves FlightNode identity");
  flight_free_node(first);

  FlightNode *removed = flight_remove_node_child(container, shape);
  expect(flight_node_equals(removed, shape), "hierarchy removal returns the same node identity");
  expect(flight_get_node_child_count(container) == 3, "hierarchy removal updates the child count");
  flight_free_node(removed);

  flight_free_node_array(snapshot);
  flight_free_node(container);
  expect(flight_get_node2d_x(sprite) == 9.5, "a child remains usable after its parent handle is freed");
  flight_free_node(sprite);
  flight_free_node(shape);
  flight_free_node(bitmap_text);
  flight_free_node(text_label);
  flight_free_node(node3d);
  flight_free_node(NULL);
}

int main(void) {
  check_scalars();
  check_handles();
  check_strings();
  check_owned_byte_readers();
  check_tuple_execution();
  check_effect_metadata_snapshots();
  check_string_arrays();
  check_import_diagnostic_lists();
  check_non_entity_create_results();
  check_shared_values();
  check_slice_carriers();
  check_outcome_results();
  check_typed_array_refs();
  check_string_maps();
  check_task_k_opaque_ownership();
  check_by_value_ownership();
  check_shared_bitmap_regions();
  check_enum_parameters();
  check_optional_texture_variants();
  check_optional_tuples();
  check_unit_signals();
  check_async_callbacks();
  check_task_m_carriers();
  check_shape_bounds_context();
  check_node_carriers();
#ifdef FLIGHT_FFI_DELIBERATE_LEAK
  FlightNode *deliberately_leaked_node = flight_create_sprite();
  expect(deliberately_leaked_node != NULL, "the deliberate leak probe allocated a live FlightNode");
#endif
  if (failures != 0) {
    fprintf(stderr, "flight-ffi C consumer: %d failure(s)\n", failures);
    return 1;
  }
  printf("flight-ffi C consumer: ok\n");
  return 0;
}
