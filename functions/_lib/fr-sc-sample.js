/* fr-sc-sample.js — the four SAMPLE board sources for Scrambled XI: Friends
 * and Vowels XI: Friends, in the content folder's own format.
 *
 * WRITTEN FOR THE REPOSITORY, NOT TAKEN FROM THE BANK. This repository is
 * public, and the bank's boards are a schedule: board 1 is the launch day's
 * eleven. Football's sample is four of its real daily boards, published days
 * by now; a Friends sample copied the same way would publish the first days
 * of a game before it opened. So these four are written here, titled as
 * samples, and are no day of the ring.
 *
 * UNDER functions/ ON PURPOSE. Pages serves every path outside functions/
 * as a static file (see _redirects: static assets are matched first, and no
 * rule can hide them), and bundles functions/ into the Worker instead.
 *
 * Five answers each, as every Friends board has (the owner, 29 Sep 2026:
 * "Always 5"). They cover the shapes the rules care about, which is what a sample is for:
 * multi-word answers (scrambled word by word), a board whose names are shown
 * as a longer title once solved (the episode boards: the answer is the key
 * word, the reveal the whole "The One With…"), and apostrophes and hyphens.
 *
 * Built by tools/build_scrambled_fr.js into fr-sc-boards.js, through the same
 * gate as every board in the bank.
 */
export const FR_SC_SAMPLE = [
  {
    id: 1,
    seed: 71900001,
    title: "Sample: Five of the Six",
    pool: "A sample board: five of the six.",
    theme: "sample",
    hintField: "none",
    source: "tools/build_scrambled_fr.js sample",
    xi: [
      { name: "RACHEL GREEN", aliases: [], kind: "character" },
      { name: "MONICA GELLER", aliases: [], kind: "character" },
      { name: "PHOEBE BUFFAY", aliases: [], kind: "character" },
      { name: "JOEY TRIBBIANI", aliases: [], kind: "character" },
      { name: "CHANDLER BING", aliases: [], kind: "character" },
    ],
  },
  {
    id: 2,
    seed: 71900002,
    title: "Sample: The One With…",
    pool: "A sample board: key words from episode titles.",
    theme: "sample",
    hintField: "none",
    source: "tools/build_scrambled_fr.js sample",
    xi: [
      { name: "EMBRYOS", display: "THE ONE WITH THE EMBRYOS", aliases: [], kind: "episode" },
      { name: "PROPOSAL", display: "THE ONE WITH THE PROPOSAL", aliases: [], kind: "episode" },
      { name: "HOLIDAY ARMADILLO", display: "THE ONE WITH THE HOLIDAY ARMADILLO", aliases: [], kind: "episode" },
      { name: "COW IN THE CITY", display: "THE ONE WITH THE COW IN THE CITY", aliases: [], kind: "episode" },
      { name: "UNAGI", display: "THE ONE WITH UNAGI", aliases: [], kind: "episode" },
    ],
  },
  {
    id: 3,
    seed: 71900003,
    title: "Sample: Places",
    pool: "A sample board: the cities, shops and hangouts of the show.",
    theme: "sample",
    hintField: "none",
    source: "tools/build_scrambled_fr.js sample",
    xi: [
      { name: "CENTRAL PERK", aliases: [], kind: "place" },
      { name: "BLOOMINGDALE'S", aliases: ["BLOOMINGDALES"], kind: "place" },
      { name: "MONTAUK", aliases: [], kind: "place" },
      { name: "LAS VEGAS", aliases: ["VEGAS"], kind: "place" },
      { name: "POUGHKEEPSIE", aliases: [], kind: "place" },
    ],
  },
  {
    id: 4,
    seed: 71900004,
    title: "Sample: Say It",
    pool: "A sample board: lines everybody quotes.",
    theme: "sample",
    hintField: "none",
    source: "tools/build_scrambled_fr.js sample",
    xi: [
      { name: "PIVOT", aliases: [], kind: "catchphrase" },
      { name: "SMELLY CAT", aliases: [], kind: "catchphrase" },
      { name: "MOO POINT", aliases: [], kind: "catchphrase" },
      { name: "HOW YOU DOIN", aliases: [], kind: "catchphrase" },
      { name: "WE WERE ON A BREAK", aliases: [], kind: "catchphrase" },
    ],
  },
];
