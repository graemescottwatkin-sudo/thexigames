/* functions/friends/index.js — the Friends hub, while Friends has a listed game.
 *
 * friends/index.html names and links every Friends game. Since 26 Nov 2026 none
 * of them is listed (the owner: "0 friends for now, lets get Football up to
 * scratch"), and a hub served as it stands would announce all of them at once.
 * themeHubRoute (permalink.js) serves the static hub while the theme has a
 * listed game and sends the address to the front door while it has none, so
 * the day one comes back this page returns with no edit here.
 */
import { themeHubRoute } from "../_lib/permalink.js";

export const onRequest = (ctx) => themeHubRoute(ctx);
