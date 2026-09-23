/* The XI Games push sender: a Worker with a cron trigger and no address.
 *
 * Pages Functions cannot run on a schedule, so the reminders are sent from
 * here. It is bound to the site's own database (crosswordxi) and deployed on
 * its own, not by the Pages build:
 *
 *   npx wrangler deploy --config workers/push/wrangler.toml
 *
 * It has no fetch handler and no workers.dev address: nothing can call it.
 * The rules are in functions/_lib/push.js and one run is workers/push/run.js.
 *
 * NO KEY, NO RUN. Without FCM_SERVICE_ACCOUNT the sender throws before any
 * row is touched, and no push_run row is written. That is on purpose. A run
 * that "succeeded" while sending nothing would look healthy to the only
 * check that watches it.
 */
import { run } from "./run.js";
import { fcmSender } from "./fcm.js";

export default {
  async scheduled(controller, env, ctx) {
    const send = fcmSender(env.FCM_SERVICE_ACCOUNT);
    ctx.waitUntil(run(env, Date.now(), send));
  },
};
