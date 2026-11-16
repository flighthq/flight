/*
 * Reference C consumer of the flight-ffi C ABI. It includes the header flight-ffi generates,
 * links the flight-ffi static library, and exercises each calling convention the generated surface
 * produces: scalar values, opaque boxed handles with field accessors and out parameters, borrowed
 * input strings, and owned output strings released through the matching flight_free_* function.
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

int main(void) {
  check_scalars();
  check_handles();
  check_strings();
  if (failures != 0) {
    fprintf(stderr, "flight-ffi C consumer: %d failure(s)\n", failures);
    return 1;
  }
  printf("flight-ffi C consumer: ok\n");
  return 0;
}
