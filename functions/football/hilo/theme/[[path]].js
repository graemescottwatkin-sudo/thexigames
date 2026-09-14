/* GET /football/hilo/theme/<theme>/
   A catch-all so one file owns what a theme slug is, the same reason the club
   tree is a catch-all. Themes are ONE level deep and stay that way: a board
   here already has an address of its own — /football/hilo/daily/<no> — so
   there is nothing for a second segment to name. */
import { themeRoute } from "../../../_lib/hl-pages.js";
export const onRequestGet = themeRoute;
