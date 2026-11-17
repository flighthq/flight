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

static void check_non_entity_create_results(void) {
  void *insets = flight_create_safe_area_insets();
  expect(insets != NULL, "create_safe_area_insets returns a struct handle");
  expect(near(flight_get_safe_area_insets_top(insets), 0.0f), "create_safe_area_insets starts zeroed");
  expect(near(flight_set_safe_area_insets_left(insets, 12.0f), 12.0f), "set_safe_area_insets_left writes");
  expect(near(flight_get_safe_area_insets_left(insets), 12.0f), "get_safe_area_insets_left reads back");
  flight_free_safe_area_insets(insets);

  /* A Ref-returning create: the handle is usable by Ref-accepting functions. Boxed Ref handles have
     no release export yet, so this one is reclaimed at process exit. */
  void *edit_menu = flight_create_default_edit_menu_template();
  expect(edit_menu != NULL, "create_default_edit_menu_template returns a Ref handle");
  char *problem = flight_validate_menu_item_template(edit_menu);
  expect(problem == NULL, "the default edit menu template validates");
  flight_free_string(problem);
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

int main(void) {
  check_scalars();
  check_handles();
  check_strings();
  check_string_arrays();
  check_non_entity_create_results();
  check_optional_texture_variants();
  check_optional_tuples();
  check_unit_signals();
  check_async_callbacks();
  if (failures != 0) {
    fprintf(stderr, "flight-ffi C consumer: %d failure(s)\n", failures);
    return 1;
  }
  printf("flight-ffi C consumer: ok\n");
  return 0;
}
