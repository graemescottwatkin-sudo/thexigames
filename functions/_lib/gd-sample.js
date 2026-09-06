/* gd-sample.js — two Grid XI boards, so the game runs with no database.
 *
 * The same arrangement HiLo and the word search keep: the BANK is 236 boards
 * and lives outside the repository, and this is a sample small enough to
 * commit and complete enough for a suite to play. Every offline run — every
 * check in CI, and `wrangler pages dev` on a machine with no D1 — sees these
 * two and says so, rather than a game that will not open.
 *
 * YES, THE ANSWERS ARE IN HERE, and that is the same trade the other two make.
 * A sample that carried no answers could not be played and so could not be
 * tested, and two boards out of 236 is not the bank. What must never happen is
 * a board reaching a BROWSER with its letters, which is a different question
 * and is what gd-board.js publicBoard and its suite are for.
 *
 * GENERATED, from the emitter's own output: node tools/build_gd_sample.js.
 * Hand-editing it would make it a third statement of what a board is, after
 * the emitter and the D1 rows.
 */
export const GD_SAMPLE_BOARDS = [
 {
  "id": "gx-0082",
  "set_id": "fifpro-world-11-2008",
  "title": "FIFPro World XI — 2008",
  "rows": 9,
  "cols": 13,
  "entries": [
   {
    "n": 1,
    "dir": "across",
    "r": 4,
    "c": 0,
    "len": 9,
    "cells": [
     "4,0",
     "4,1",
     "4,2",
     "4,3",
     "4,4",
     "4,5",
     "4,6",
     "4,7",
     "4,8"
    ],
    "answer": "FERDINAND",
    "member": "Rio Ferdinand"
   },
   {
    "n": 2,
    "dir": "down",
    "r": 2,
    "c": 2,
    "len": 5,
    "cells": [
     "2,2",
     "3,2",
     "4,2",
     "5,2",
     "6,2"
    ],
    "answer": "TERRY",
    "member": "John Terry"
   },
   {
    "n": 3,
    "dir": "down",
    "r": 0,
    "c": 6,
    "len": 7,
    "cells": [
     "0,6",
     "1,6",
     "2,6",
     "3,6",
     "4,6",
     "5,6",
     "6,6"
    ],
    "answer": "GERRARD",
    "member": "Steven Gerrard"
   },
   {
    "n": 4,
    "dir": "across",
    "r": 2,
    "c": 6,
    "len": 7,
    "cells": [
     "2,6",
     "2,7",
     "2,8",
     "2,9",
     "2,10",
     "2,11",
     "2,12"
    ],
    "answer": "RONALDO",
    "member": "Cristiano Ronaldo"
   },
   {
    "n": 5,
    "dir": "down",
    "r": 1,
    "c": 4,
    "len": 8,
    "cells": [
     "1,4",
     "2,4",
     "3,4",
     "4,4",
     "5,4",
     "6,4",
     "7,4",
     "8,4"
    ],
    "answer": "CASILLAS",
    "member": "Iker Casillas"
   },
   {
    "n": 6,
    "dir": "down",
    "r": 1,
    "c": 12,
    "len": 6,
    "cells": [
     "1,12",
     "2,12",
     "3,12",
     "4,12",
     "5,12",
     "6,12"
    ],
    "answer": "TORRES",
    "member": "Fernando Torres"
   },
   {
    "n": 7,
    "dir": "across",
    "r": 6,
    "c": 8,
    "len": 5,
    "cells": [
     "6,8",
     "6,9",
     "6,10",
     "6,11",
     "6,12"
    ],
    "answer": "RAMOS",
    "member": "Sergio Ramos"
   },
   {
    "n": 8,
    "dir": "down",
    "r": 5,
    "c": 9,
    "len": 4,
    "cells": [
     "5,9",
     "6,9",
     "7,9",
     "8,9"
    ],
    "answer": "KAKA",
    "member": "Kaká"
   },
   {
    "n": 9,
    "dir": "across",
    "r": 8,
    "c": 1,
    "len": 5,
    "cells": [
     "8,1",
     "8,2",
     "8,3",
     "8,4",
     "8,5"
    ],
    "answer": "MESSI",
    "member": "Lionel Messi"
   },
   {
    "n": 10,
    "dir": "across",
    "r": 6,
    "c": 0,
    "len": 5,
    "cells": [
     "6,0",
     "6,1",
     "6,2",
     "6,3",
     "6,4"
    ],
    "answer": "PUYOL",
    "member": "Carles Puyol"
   },
   {
    "n": 11,
    "dir": "across",
    "r": 8,
    "c": 8,
    "len": 4,
    "cells": [
     "8,8",
     "8,9",
     "8,10",
     "8,11"
    ],
    "answer": "XAVI",
    "member": "Xavi"
   }
  ],
  "crossings": [
   {
    "cell": "4,2",
    "entries": [
     1,
     2
    ],
    "at": [
     2,
     2
    ]
   },
   {
    "cell": "4,4",
    "entries": [
     1,
     5
    ],
    "at": [
     4,
     3
    ]
   },
   {
    "cell": "4,6",
    "entries": [
     1,
     3
    ],
    "at": [
     6,
     4
    ]
   },
   {
    "cell": "6,2",
    "entries": [
     2,
     10
    ],
    "at": [
     4,
     2
    ]
   },
   {
    "cell": "2,6",
    "entries": [
     3,
     4
    ],
    "at": [
     2,
     0
    ]
   },
   {
    "cell": "2,12",
    "entries": [
     4,
     6
    ],
    "at": [
     6,
     1
    ]
   },
   {
    "cell": "6,4",
    "entries": [
     5,
     10
    ],
    "at": [
     5,
     4
    ]
   },
   {
    "cell": "8,4",
    "entries": [
     5,
     9
    ],
    "at": [
     7,
     3
    ]
   },
   {
    "cell": "6,12",
    "entries": [
     6,
     7
    ],
    "at": [
     5,
     4
    ]
   },
   {
    "cell": "6,9",
    "entries": [
     7,
     8
    ],
    "at": [
     1,
     1
    ]
   },
   {
    "cell": "8,9",
    "entries": [
     8,
     11
    ],
    "at": [
     3,
     1
    ]
   }
  ],
  "quality": {
   "crossings": 11,
   "mean": 2,
   "min": 1
  }
 },
 {
  "id": "gx-0169",
  "set_id": "premier-league-founder-members",
  "title": "Founder members of the Premier League",
  "rows": 16,
  "cols": 16,
  "entries": [
   {
    "n": 1,
    "dir": "across",
    "r": 8,
    "c": 0,
    "len": 16,
    "cells": [
     "8,0",
     "8,1",
     "8,2",
     "8,3",
     "8,4",
     "8,5",
     "8,6",
     "8,7",
     "8,8",
     "8,9",
     "8,10",
     "8,11",
     "8,12",
     "8,13",
     "8,14",
     "8,15"
    ],
    "answer": "NOTTINGHAMFOREST",
    "member": "Nottingham Forest"
   },
   {
    "n": 2,
    "dir": "down",
    "r": 0,
    "c": 0,
    "len": 15,
    "cells": [
     "0,0",
     "1,0",
     "2,0",
     "3,0",
     "4,0",
     "5,0",
     "6,0",
     "7,0",
     "8,0",
     "9,0",
     "10,0",
     "11,0",
     "12,0",
     "13,0",
     "14,0"
    ],
    "answer": "BLACKBURNROVERS",
    "member": "Blackburn Rovers"
   },
   {
    "n": 3,
    "dir": "down",
    "r": 1,
    "c": 2,
    "len": 14,
    "cells": [
     "1,2",
     "2,2",
     "3,2",
     "4,2",
     "5,2",
     "6,2",
     "7,2",
     "8,2",
     "9,2",
     "10,2",
     "11,2",
     "12,2",
     "13,2",
     "14,2"
    ],
    "answer": "MANCHESTERCITY",
    "member": "Manchester City"
   },
   {
    "n": 4,
    "dir": "down",
    "r": 4,
    "c": 5,
    "len": 10,
    "cells": [
     "4,5",
     "5,5",
     "6,5",
     "7,5",
     "8,5",
     "9,5",
     "10,5",
     "11,5",
     "12,5",
     "13,5"
    ],
    "answer": "ASTONVILLA",
    "member": "Aston Villa"
   },
   {
    "n": 5,
    "dir": "down",
    "r": 1,
    "c": 13,
    "len": 9,
    "cells": [
     "1,13",
     "2,13",
     "3,13",
     "4,13",
     "5,13",
     "6,13",
     "7,13",
     "8,13",
     "9,13"
    ],
    "answer": "MANUNITED",
    "member": "Manchester United"
   },
   {
    "n": 6,
    "dir": "down",
    "r": 4,
    "c": 15,
    "len": 7,
    "cells": [
     "4,15",
     "5,15",
     "6,15",
     "7,15",
     "8,15",
     "9,15",
     "10,15"
    ],
    "answer": "EVERTON",
    "member": "Everton"
   },
   {
    "n": 7,
    "dir": "down",
    "r": 0,
    "c": 9,
    "len": 16,
    "cells": [
     "0,9",
     "1,9",
     "2,9",
     "3,9",
     "4,9",
     "5,9",
     "6,9",
     "7,9",
     "8,9",
     "9,9",
     "10,9",
     "11,9",
     "12,9",
     "13,9",
     "14,9",
     "15,9"
    ],
    "answer": "TOTTENHAMHOTSPUR",
    "member": "Tottenham Hotspur"
   },
   {
    "n": 8,
    "dir": "down",
    "r": 7,
    "c": 7,
    "len": 7,
    "cells": [
     "7,7",
     "8,7",
     "9,7",
     "10,7",
     "11,7",
     "12,7",
     "13,7"
    ],
    "answer": "CHELSEA",
    "member": "Chelsea"
   },
   {
    "n": 9,
    "dir": "across",
    "r": 15,
    "c": 8,
    "len": 7,
    "cells": [
     "15,8",
     "15,9",
     "15,10",
     "15,11",
     "15,12",
     "15,13",
     "15,14"
    ],
    "answer": "ARSENAL",
    "member": "Arsenal"
   },
   {
    "n": 10,
    "dir": "down",
    "r": 1,
    "c": 11,
    "len": 9,
    "cells": [
     "1,11",
     "2,11",
     "3,11",
     "4,11",
     "5,11",
     "6,11",
     "7,11",
     "8,11",
     "9,11"
    ],
    "answer": "LIVERPOOL",
    "member": "Liverpool"
   },
   {
    "n": 11,
    "dir": "across",
    "r": 12,
    "c": 5,
    "len": 11,
    "cells": [
     "12,5",
     "12,6",
     "12,7",
     "12,8",
     "12,9",
     "12,10",
     "12,11",
     "12,12",
     "12,13",
     "12,14",
     "12,15"
    ],
    "answer": "LEEDSUNITED",
    "member": "Leeds United"
   }
  ],
  "crossings": [
   {
    "cell": "8,0",
    "entries": [
     1,
     2
    ],
    "at": [
     0,
     8
    ]
   },
   {
    "cell": "8,2",
    "entries": [
     1,
     3
    ],
    "at": [
     2,
     7
    ]
   },
   {
    "cell": "8,5",
    "entries": [
     1,
     4
    ],
    "at": [
     5,
     4
    ]
   },
   {
    "cell": "8,7",
    "entries": [
     1,
     8
    ],
    "at": [
     7,
     1
    ]
   },
   {
    "cell": "8,9",
    "entries": [
     1,
     7
    ],
    "at": [
     9,
     8
    ]
   },
   {
    "cell": "8,11",
    "entries": [
     1,
     10
    ],
    "at": [
     11,
     7
    ]
   },
   {
    "cell": "8,13",
    "entries": [
     1,
     5
    ],
    "at": [
     13,
     7
    ]
   },
   {
    "cell": "8,15",
    "entries": [
     1,
     6
    ],
    "at": [
     15,
     4
    ]
   },
   {
    "cell": "12,5",
    "entries": [
     4,
     11
    ],
    "at": [
     8,
     0
    ]
   },
   {
    "cell": "12,9",
    "entries": [
     7,
     11
    ],
    "at": [
     12,
     4
    ]
   },
   {
    "cell": "15,9",
    "entries": [
     7,
     9
    ],
    "at": [
     15,
     1
    ]
   },
   {
    "cell": "12,7",
    "entries": [
     8,
     11
    ],
    "at": [
     5,
     2
    ]
   }
  ],
  "quality": {
   "crossings": 12,
   "mean": 2.182,
   "min": 1
  }
 }
];

/* The calendar, as OFFSETS from the family epoch rather than dates — a
   fixture with a date written into it stops being today. dailyDayKey turns a
   board number into the day it stands for, and the sample simply claims the
   two most recent. */
export const GD_SAMPLE_SCHEDULE = {"0":"gx-0169","-1":"gx-0082"};
