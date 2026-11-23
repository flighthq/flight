/* TextFormat through the C ABI: the default constructor, has/get/set/clear for optional fields of
 * every lowered shape (absent versus present false, zero and empty string), SDK calls on the one
 * registry-guarded handle, and refusal of NULL, freed, forged and other-family handles. */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "flight_ffi.h"

static int failures = 0;

static void check(bool ok, const char *what) {
  if (!ok) {
    printf("flight-ffi text format: FAILED %s\n", what);
    failures += 1;
  }
}

static bool text_equals(char *text, const char *expected) {
  bool same = text != NULL && strcmp(text, expected) == 0;
  flight_free_string(text);
  return same;
}

static void absent_versus_present(void) {
  void *format = flight_create_text_format();
  check(format != NULL, "create");

  bool flag = true;
  check(!flight_has_text_format_bold(format), "bold starts absent");
  check(!flight_get_text_format_bold(format, &flag) && flag, "absent bold reads nothing");
  check(flight_set_text_format_bold(format, false), "set bold false");
  check(flight_has_text_format_bold(format), "false bold is present");
  check(flight_get_text_format_bold(format, &flag) && !flag, "present false bold reads false");

  float size = -1.0f;
  check(!flight_get_text_format_size(format, &size), "size starts absent");
  check(flight_set_text_format_size(format, 0.0f), "set size zero");
  check(flight_get_text_format_size(format, &size) && size == 0.0f, "present zero size");

  check(flight_get_text_format_font(format) == NULL, "absent font is NULL");
  check(flight_set_text_format_font(format, ""), "set empty font");
  check(text_equals(flight_get_text_format_font(format), ""), "present empty font is not NULL");
  check(flight_set_text_format_font(format, "Noto Sans"), "set font");
  check(text_equals(flight_get_text_format_font(format), "Noto Sans"), "font round trip");
  const char invalid[] = {(char)0xc3, 0};
  check(!flight_set_text_format_font(format, invalid), "invalid UTF-8 refused");
  check(!flight_set_text_format_font(format, NULL), "NULL text refused");
  check(text_equals(flight_get_text_format_font(format), "Noto Sans"), "refusals change nothing");

  uint32_t align = 99;
  check(!flight_get_text_format_align(format, &align) && align == 99, "align starts absent");
  check(flight_set_text_format_align(format, 0), "set align by discriminant");
  check(flight_get_text_format_align(format, &align) && align == 0, "align round trip");
  check(!flight_set_text_format_align(format, 0xffffffffu), "a non-discriminant is refused");
  check(flight_get_text_format_align(format, &align) && align == 0, "refused align changes nothing");

  const float stops[] = {10.0f, 20.5f, 40.0f};
  float read[4] = {0};
  size_t len = 0;
  check(!flight_get_text_format_tab_stops(format, read, 4, &len), "tab stops start absent");
  check(flight_set_text_format_tab_stops(format, (void *)stops, 3), "set tab stops");
  check(flight_get_text_format_tab_stops(format, read, 4, &len) && len == 3 && read[1] == 20.5f,
        "tab stops round trip");
  check(flight_set_text_format_tab_stops(format, NULL, 0), "set an empty list");
  check(flight_get_text_format_tab_stops(format, read, 4, &len) && len == 0,
        "an empty list is present");
  check(!flight_set_text_format_tab_stops(format, NULL, 2), "NULL values with a length refused");

  const char *axes[] = {"wght", "ital"};
  const float values[] = {700.0f, 1.0f};
  check(flight_set_text_format_variations(format, axes, (void *)values, 2), "set variations");
  size_t count = 0;
  float value = 0.0f;
  check(flight_get_text_format_variations_len(format, &count) && count == 2, "variations len");
  check(text_equals(flight_get_text_format_variations_axis(format, 1), "ital"), "variation axis");
  check(flight_get_text_format_variations_value(format, 0, &value) && value == 700.0f,
        "variation value");
  check(flight_get_text_format_variations_axis(format, 2) == NULL, "out of range axis");

  check(flight_clear_text_format_bold(format) && !flight_has_text_format_bold(format), "clear");
  check(flight_clear_text_format_variations(format) && !flight_has_text_format_variations(format),
        "clear a list");
  flight_free_text_format_ref(format);
}

static void sdk_calls(void) {
  void *base = flight_create_text_format();
  void *over = flight_create_text_format();
  flight_set_text_format_size(base, 20.0f);
  flight_set_text_format_bold(base, true);
  flight_set_text_format_bold(over, false);
  check(flight_get_text_format_ascent(base) == 20.0f, "ascent reads the present size");

  void *merged = flight_merge_text_format(base, over);
  check(merged != NULL && merged != base && merged != over, "merge returns a new handle");
  bool flag = true;
  float size = 0.0f;
  check(flight_get_text_format_bold(merged, &flag) && !flag, "present false overrides");
  check(flight_get_text_format_size(merged, &size) && size == 20.0f, "absent keeps the base");

  void *same = flight_merge_text_format(base, base);
  check(same != NULL, "merging a handle with itself");
  flight_free_text_format_ref(same);
  flight_free_text_format_ref(merged);
  flight_free_text_format_ref(over);
  flight_free_text_format_ref(base);
}

static void refusals(void) {
  void *format = flight_create_text_format();
  flight_set_text_format_bold(format, true);
  void *stale = format;
  flight_free_text_format_ref(format);
  bool flag = false;
  check(!flight_has_text_format_bold(stale), "a freed handle is refused");
  check(!flight_set_text_format_bold(stale, false), "a freed handle is not written");
  check(!flight_get_text_format_bold(stale, &flag), "a freed handle reads nothing");
  flight_free_text_format_ref(stale);

  check(!flight_has_text_format_bold(NULL), "NULL is refused");
  check(flight_get_text_format_ascent(NULL) == 0.0f, "NULL ascent is refused with zero");
  check(flight_get_text_format_ascent(stale) == 0.0f, "freed ascent is refused with zero");

  void *bitmap = flight_create_bitmap(1, 1, 0);
  check(!flight_has_text_format_bold(bitmap), "another carrier's handle is refused");
  flight_free_text_format_ref(bitmap);
  check(flight_get_bitmap_pixel(bitmap, 0, 0) == 0, "freeing a foreign handle releases nothing");
  flight_free_bitmap_ref(bitmap);

  void *forged = (void *)(uintptr_t)0x1234500du;
  check(!flight_has_text_format_bold(forged), "a forged token is refused");
}

int main(void) {
  absent_versus_present();
  sdk_calls();
  refusals();
  if (failures != 0) {
    return 1;
  }
  printf("flight-ffi text format: ok\n");
  return 0;
}
