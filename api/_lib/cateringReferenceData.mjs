/**
 * Catering Companion — buildings and rooms reference data.
 *
 * Committed on purpose. Unlike the Events export, this carries no personal
 * data: building names, room names, capacities, and seating notes describe
 * facilities, not people. Committing it means production can be seeded from a
 * browser (POST /api/catering {"action":"seed-reference"}) by someone who has
 * no terminal, and that a fresh clone gets the real room list rather than the
 * two synthetic sample rooms.
 *
 * Source: "UCAR Summit Data Sheet" → Rooms tab. Room keys are carried over
 * from the AppSheet export rather than derived, so document IDs stay stable
 * across re-seeds and match anything already referencing them.
 *
 * Regenerate by exporting the tab and re-running the transform in
 * docs/catering/SEED_AND_MIGRATION.md.
 */

export const BUILDINGS = [
  {
    "key": "ML",
    "name": "Mesa Lab"
  },
  {
    "key": "CG1",
    "name": "Center Green 1"
  },
  {
    "key": "CG2",
    "name": "Center Green 2"
  },
  {
    "key": "FL0",
    "name": "Foothills Lab 0"
  },
  {
    "key": "FL1",
    "name": "Foothills Lab 1"
  },
  {
    "key": "FL2",
    "name": "Foothills Lab 2"
  },
  {
    "key": "FL3",
    "name": "Foothills Lab 3"
  },
  {
    "key": "FL4",
    "name": "Foothills Lab 4"
  },
  {
    "key": "FLA",
    "name": "Foothills Lab Annex"
  }
];

export const ROOMS = [
  {
    "key": "CG1-1210-South-Auditorium",
    "name": "1210 South Auditorium",
    "building": "CG1",
    "capacity": 80,
    "seatingNotes": "Classroom 40; Theater 80; Rounds 56",
    "fixed": "No"
  },
  {
    "key": "CG1-1212-Center-Auditorium",
    "name": "1212 Center Auditorium",
    "building": "CG1",
    "capacity": 160,
    "seatingNotes": "Classroom 80; Theater 160; Rounds 96",
    "fixed": "No"
  },
  {
    "key": "CG1-1214-North-Auditorium",
    "name": "1214 North Auditorium",
    "building": "CG1",
    "capacity": 80,
    "seatingNotes": "Classroom 40; Theater 80; Rounds 56",
    "fixed": "No"
  },
  {
    "key": "CG1-2126",
    "name": "CG1-2126",
    "building": "CG1",
    "capacity": 34,
    "seatingNotes": "Fixed conference 20 + 14 additional chairs",
    "fixed": "Yes"
  },
  {
    "key": "CG1-2503",
    "name": "CG1-2503",
    "building": "CG1",
    "capacity": 14,
    "seatingNotes": "Fixed conference 14",
    "fixed": "Yes"
  },
  {
    "key": "CG1-2603",
    "name": "CG1-2603",
    "building": "CG1",
    "capacity": 16,
    "seatingNotes": "Fixed conference 11 + 5 additional chairs",
    "fixed": "Yes"
  },
  {
    "key": "CG1-2607",
    "name": "CG1-2607",
    "building": "CG1",
    "capacity": 24,
    "seatingNotes": "Fixed conference 13 + 11 additional chairs",
    "fixed": "Yes"
  },
  {
    "key": "CG1-3131",
    "name": "CG1-3131",
    "building": "CG1",
    "capacity": 33,
    "seatingNotes": "Fixed conference 11 + 22 additional chairs",
    "fixed": "Yes"
  },
  {
    "key": "CG1-3150",
    "name": "CG1-3150",
    "building": "CG1",
    "capacity": 21,
    "seatingNotes": "U-shape 12 + 9 additional chairs",
    "fixed": "Yes"
  },
  {
    "key": "CG1-2122",
    "name": "CG1-2122",
    "building": "CG1",
    "capacity": 14,
    "seatingNotes": "Fixed conference 10 + 4 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "CG2-2130",
    "name": "CG2-2130",
    "building": "CG2",
    "capacity": 6,
    "seatingNotes": "Fixed conference 6",
    "fixed": "Yes"
  },
  {
    "key": "CG2-3024",
    "name": "CG2-3024",
    "building": "CG2",
    "capacity": 17,
    "seatingNotes": "Fixed classroom 17",
    "fixed": "Yes"
  },
  {
    "key": "CG2-3034",
    "name": "CG2-3034",
    "building": "CG2",
    "capacity": 16,
    "seatingNotes": "Flexible seating 16",
    "fixed": "Yes"
  },
  {
    "key": "CG2-3116",
    "name": "CG2-3116",
    "building": "CG2",
    "capacity": 13,
    "seatingNotes": "Fixed conference 10 + 3 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "CG2-3138",
    "name": "CG2-3138",
    "building": "CG2",
    "capacity": 13,
    "seatingNotes": "Fixed conference 11 + 2 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL0-2512",
    "name": "FL0-2512",
    "building": "FL0",
    "capacity": 21,
    "seatingNotes": "Fixed conference 21, incl. 14 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL1-2133",
    "name": "FL1-2133",
    "building": "FL1",
    "capacity": 9,
    "seatingNotes": "Fixed conference 9 + 12 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL1-2198-The-Atrium",
    "name": "The Atrium",
    "building": "FL1",
    "capacity": 18,
    "seatingNotes": "Conference 18 + 26 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL2-1001-Small-Seminar",
    "name": "1001 Small Seminar",
    "building": "FL2",
    "capacity": 60,
    "seatingNotes": "Fixed theater 60",
    "fixed": "Yes"
  },
  {
    "key": "FL2-1002",
    "name": "FL2-1002",
    "building": "FL2",
    "capacity": 11,
    "seatingNotes": "U-shape 11 + 12 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL2-1003",
    "name": "FL2-1003",
    "building": "FL2",
    "capacity": 11,
    "seatingNotes": "U-shape 11 + 10 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL2-1022-Large-Auditorium",
    "name": "1022 Large Auditorium",
    "building": "FL2",
    "capacity": 140,
    "seatingNotes": "Fixed theater 140",
    "fixed": "Yes"
  },
  {
    "key": "FL2-2006",
    "name": "FL2-2006",
    "building": "FL2",
    "capacity": 8,
    "seatingNotes": "Conference 8",
    "fixed": "Yes"
  },
  {
    "key": "FL2-3107",
    "name": "FL2-3107",
    "building": "FL2",
    "capacity": 13,
    "seatingNotes": "Conference 13 + 18 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL3-1067",
    "name": "FL3-1067",
    "building": "FL3",
    "capacity": 9,
    "seatingNotes": "Conference 9 + 18 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL3-2072",
    "name": "FL3-2072",
    "building": "FL3",
    "capacity": 25,
    "seatingNotes": "Conference 25",
    "fixed": "Yes"
  },
  {
    "key": "FL4-1101",
    "name": "FL4-1101",
    "building": "FL4",
    "capacity": 10,
    "seatingNotes": "Conference 10",
    "fixed": "Yes"
  },
  {
    "key": "FL4-1201",
    "name": "FL4-1201",
    "building": "FL4",
    "capacity": 20,
    "seatingNotes": "Fixed conference 20 + 7 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL4-1241",
    "name": "FL4-1241",
    "building": "FL4",
    "capacity": 7,
    "seatingNotes": "Fixed conference 7 + 7 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FL4-2101",
    "name": "FL4-2101",
    "building": "FL4",
    "capacity": 10,
    "seatingNotes": "Fixed conference 10 + 8 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FLA-1004",
    "name": "FLA-1004",
    "building": "FLA",
    "capacity": 12,
    "seatingNotes": "Conference 12 (8 at table, 4 at perimeter)",
    "fixed": "Yes"
  },
  {
    "key": "FLA-2111",
    "name": "FLA-2111",
    "building": "FLA",
    "capacity": 15,
    "seatingNotes": "Conference 15 + 24 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FLA-2205",
    "name": "FLA-2205",
    "building": "FLA",
    "capacity": 13,
    "seatingNotes": "Conference 13 + 21 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FLA-2238",
    "name": "FLA-2238",
    "building": "FLA",
    "capacity": 11,
    "seatingNotes": "Conference 11 + 10 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "FLA-3205",
    "name": "FLA-3205",
    "building": "FLA",
    "capacity": 8,
    "seatingNotes": "Fixed conference 8",
    "fixed": "Yes"
  },
  {
    "key": "ML-34",
    "name": "ML-34",
    "building": "ML",
    "capacity": 15,
    "seatingNotes": "Fixed conference 15",
    "fixed": "Yes"
  },
  {
    "key": "ML-40",
    "name": "ML-40",
    "building": "ML",
    "capacity": 28,
    "seatingNotes": "Fixed conference 28",
    "fixed": "Yes"
  },
  {
    "key": "ML-132-Main-Seminar-Rm",
    "name": "132 Main Seminar Room",
    "building": "ML",
    "capacity": 124,
    "seatingNotes": "Fixed theater 124",
    "fixed": "Yes"
  },
  {
    "key": "ML-215-Dir-Conf-Rm",
    "name": "215 Director's Conference Room",
    "building": "ML",
    "capacity": 12,
    "seatingNotes": "Conference 12 + 15 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "ML-239-Damon-Rm",
    "name": "239 Damon Room",
    "building": "ML",
    "capacity": 100,
    "seatingNotes": "Inner: fixed conference 17 + 20 at perimeter; Outer: 100",
    "fixed": "Yes"
  },
  {
    "key": "ML-245-Chapman-Rm",
    "name": "245 Chapman Room",
    "building": "ML",
    "capacity": 16,
    "seatingNotes": "Fixed hollow square 16",
    "fixed": "Yes"
  },
  {
    "key": "ML-315",
    "name": "ML-315",
    "building": "ML",
    "capacity": 9,
    "seatingNotes": "Conference 9 + 5 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "ML-680-Tower-B",
    "name": "680 Tower B",
    "building": "ML",
    "capacity": 11,
    "seatingNotes": "Fixed conference 11 + 13 at perimeter",
    "fixed": "Yes"
  },
  {
    "key": "ML-FB-WOR-Board-Rm",
    "name": "FB/WOR Board Room",
    "building": "ML",
    "capacity": 44,
    "seatingNotes": "Conference 44 (16 table, 28 perimeter); Classroom 44 (24 table, 20 perimeter)",
    "fixed": ""
  }
];
