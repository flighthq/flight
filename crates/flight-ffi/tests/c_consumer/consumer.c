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

static void check_string_arrays(void) {
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
  const char *starling = "<TextureAtlas imagePath=\"a.png\"></TextureAtlas>";
  /* NULL collects nothing; the parse still returns its owned result. */
  void *data = flight_parse_starling_spritesheet(starling, NULL, NULL);
  expect(data != NULL, "a NULL diagnostics list still parses");
  flight_free_spritesheet_data(data);

  void *list = flight_create_import_diagnostic_list();
  expect(list != NULL && flight_get_import_diagnostic_list_length(list) == 0, "a new list is empty");
  data = flight_parse_cocos_plist_spritesheet(cocos, list);
  flight_free_spritesheet_data(data);
  data = flight_parse_starling_spritesheet(starling, NULL, list);
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
  expect(flight_get_import_diagnostic_list_severity(list, 1) == 1, "missing dimensions has Recover severity");
  expect(flight_get_import_diagnostic_list_detail_length(list, 1) == 0, "a detail-free diagnostic has no detail");
  expect(flight_get_import_diagnostic_list_severity(list, 2) == -1, "an index past the end reads -1");
  expect(flight_get_import_diagnostic_list_kind(list, 2) == NULL, "an index past the end reads NULL");

  flight_clear_import_diagnostic_list(list);
  expect(flight_get_import_diagnostic_list_length(list) == 0, "clear empties the list for reuse");

  /* A live handle of another type is no list: nothing collects into it, reads are empty, and clear and
     destroy leave it intact for its own helpers to read and release. */
  void *windows = flight_vec_ref_app_window_create();
  data = flight_parse_starling_spritesheet(starling, NULL, windows);
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
  flight_free_texture(texture);
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
  flight_free_path(path);
}

static void check_unit_signals(void) {
  /* The history is a Ref handle; boxed Ref handles have no release export yet. */
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

static float ease_identity(void *ctx, float t) {
  (void)ctx;
  return t;
}

static void check_optional_callbacks(void) {
  /* An optional callback parameter takes a typed function pointer, or NULL for none. */
  bool (*transition)(void *, void *, float, float (*)(void *, float), void *) =
      flight_transition_animation_state_machine;
  float (*ease)(void *, float) = ease_identity;
  expect(transition != NULL && ease(NULL, 0.5f) == 0.5f, "optional callbacks are typed function pointers");
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

int main(void) {
  check_scalars();
  check_handles();
  check_strings();
  check_string_arrays();
  check_import_diagnostic_lists();
  check_non_entity_create_results();
  check_shared_values();
  check_optional_texture_variants();
  check_optional_tuples();
  check_unit_signals();
  check_async_callbacks();
  check_optional_callbacks();
  check_shape_bounds_context();
  if (failures != 0) {
    fprintf(stderr, "flight-ffi C consumer: %d failure(s)\n", failures);
    return 1;
  }
  printf("flight-ffi C consumer: ok\n");
  return 0;
}
