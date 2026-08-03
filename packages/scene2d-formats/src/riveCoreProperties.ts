import type { RiveFieldType } from '@flighthq/types/contract';
import { RiveFieldType as RiveFieldTypeValue } from '@flighthq/types/contract';

/**
 * The wire width of every property key Rive's own object model defines, which is what a reader needs
 * to traverse a real `.riv`. The file's table of contents is only a *supplement*: an authoring tool
 * writes into it the keys it believes a reader may not know, and a file whose properties are all
 * standard ships an empty table. A reader with no built-in table therefore cannot advance past the
 * first property of the first object in a typical file.
 *
 * Derived from the 368 object-model definitions the format publishes as data, taking each property's
 * runtime type and excluding the editor-only properties that are never written to a runtime file.
 * Alternate keys are included: a property may carry retired key numbers alongside its current one, and
 * real files in circulation still use them. Every key resolved to exactly one width across all
 * definitions, which is the consistency the format requires of a globally unique keyspace.
 */
export function getRiveCorePropertyFieldType(key: number): RiveFieldType | undefined {
  return _fieldTypesByKey.get(key);
}

/**
 * Whether a property's length-prefixed bytes are a raw blob rather than text. The wire cannot say —
 * both travel under the same code — so this comes from the object model, and reading a blob as UTF-8
 * would corrupt it.
 */
export function isRiveCoreBytesProperty(key: number): boolean {
  return RIVE_BYTES_PROPERTY_KEYS.includes(key);
}

// Length-prefixed like text, but raw: asset payloads, signatures, and cdn identifiers.
const RIVE_BYTES_PROPERTY_KEYS = [212, 223, 359, 582, 588, 711, 866, 868, 871, 911, 920, 963];

// Varuint: unsigned integers, object ids, enums, and booleans (a bool is one 0/1 byte).
const RIVE_UINT_PROPERTY_KEYS = [
  5, 23, 32, 40, 41, 48, 49, 50, 51, 53, 56, 57, 59, 60, 61, 62, 67, 68, 69, 92, 93, 94, 95, 102, 103, 110, 111, 112,
  113, 117, 119, 120, 121, 122, 125, 128, 129, 141, 149, 151, 152, 155, 156, 158, 160, 164, 165, 167, 168, 171, 173,
  174, 175, 178, 179, 180, 181, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 201, 204, 206, 219, 220, 224,
  225, 227, 228, 236, 237, 238, 240, 245, 249, 272, 279, 281, 284, 287, 289, 296, 298, 301, 302, 312, 313, 316, 320,
  325, 326, 333, 335, 349, 350, 356, 357, 364, 365, 376, 377, 378, 389, 392, 393, 399, 400, 405, 408, 494, 536, 537,
  538, 541, 549, 550, 554, 560, 565, 566, 574, 577, 583, 586, 587, 589, 590, 591, 593, 596, 597, 598, 599, 604, 605,
  606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628,
  629, 630, 631, 632, 634, 637, 639, 647, 650, 653, 655, 656, 660, 665, 666, 667, 668, 669, 672, 673, 676, 677, 679,
  682, 683, 685, 686, 687, 689, 691, 693, 703, 705, 708, 709, 713, 714, 715, 722, 724, 725, 726, 727, 731, 734, 743,
  745, 746, 747, 748, 752, 757, 758, 764, 765, 770, 775, 776, 778, 779, 782, 798, 799, 800, 814, 816, 823, 824, 835,
  846, 848, 850, 851, 856, 858, 861, 862, 863, 870, 872, 873, 874, 875, 876, 887, 891, 892, 893, 895, 912, 914, 921,
  922, 930, 931, 932, 934, 935, 952, 953, 954, 955, 956, 957, 962, 965, 966, 971, 972, 973, 974, 977, 978, 979, 980,
  981, 982, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999, 1000, 1001, 1002, 1003, 1004, 1005,
  1006, 1007, 1008, 1009, 1010, 1011, 1014, 1015, 1018, 1019, 1020, 1021, 1022, 1025, 1026, 1027, 1028, 1033, 1045,
  1046, 1047, 1048, 1049, 1050, 1059, 1061, 1062, 1064, 1068,
];

// Varuint byte length followed by that many bytes: text and opaque blobs.
const RIVE_STRING_PROPERTY_KEYS = [
  4, 55, 138, 203, 212, 223, 246, 248, 268, 280, 359, 362, 557, 561, 572, 578, 579, 582, 588, 635, 654, 662, 711, 744,
  766, 817, 866, 868, 871, 911, 920, 926, 963, 983, 984, 985, 1043,
];

// Four bytes, IEEE-754 binary32, little-endian.
const RIVE_DOUBLE_PROPERTY_KEYS = [
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 24, 25, 26, 31, 33, 34, 35, 39, 42, 46, 47, 58, 63, 64, 65, 66,
  70, 79, 80, 81, 82, 83, 84, 85, 86, 87, 89, 90, 91, 96, 97, 98, 99, 100, 101, 104, 105, 106, 107, 108, 109, 114, 115,
  116, 123, 124, 126, 127, 140, 157, 161, 162, 163, 166, 172, 177, 182, 183, 184, 185, 186, 187, 199, 200, 202, 207,
  208, 215, 216, 229, 239, 243, 274, 285, 286, 288, 292, 297, 299, 300, 303, 304, 305, 306, 307, 308, 317, 318, 319,
  321, 322, 323, 324, 327, 328, 329, 330, 331, 332, 334, 336, 337, 338, 339, 340, 363, 366, 367, 370, 371, 372, 373,
  380, 381, 390, 406, 407, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515,
  516, 517, 518, 519, 523, 524, 530, 575, 592, 636, 640, 641, 642, 643, 644, 645, 652, 663, 664, 675, 681, 690, 692,
  697, 698, 699, 700, 706, 707, 716, 717, 718, 719, 728, 729, 730, 749, 750, 751, 756, 759, 760, 761, 762, 763, 777,
  781, 783, 784, 785, 786, 806, 807, 808, 809, 810, 811, 818, 859, 860, 864, 865, 888, 889, 894, 907, 908, 975, 976,
  1023, 1024, 1029, 1040, 1041, 1057, 1058, 1063, 1065, 1066, 1067, 1069, 1070,
];

// Four bytes, unsigned 32-bit little-endian, carrying a packed color.
const RIVE_COLOR_PROPERTY_KEYS = [37, 38, 88, 555, 638, 651, 836];

function buildRiveFieldTypeTable(): Map<number, RiveFieldType> {
  const table = new Map<number, RiveFieldType>();
  for (const key of RIVE_UINT_PROPERTY_KEYS) table.set(key, RiveFieldTypeValue.Uint);
  for (const key of RIVE_STRING_PROPERTY_KEYS) table.set(key, RiveFieldTypeValue.String);
  for (const key of RIVE_DOUBLE_PROPERTY_KEYS) table.set(key, RiveFieldTypeValue.Double);
  for (const key of RIVE_COLOR_PROPERTY_KEYS) table.set(key, RiveFieldTypeValue.Color);
  return table;
}

const _fieldTypesByKey = buildRiveFieldTypeTable();
