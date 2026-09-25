/* tools/local_resources.js — a page under test never reaches the internet.
 *
 * WHY. Every served page links a Google Fonts stylesheet, and jsdom puts a
 * <link rel="stylesheet"> on the same ordered queue as the page's scripts: no
 * script after it runs until it has loaded. So the suites that load a page
 * with resources "usable" were waiting on fonts.googleapis.com before a line
 * of the game ran. Measured 25 Sep 2026 on the grid page: scripts ran after
 * 562ms with Google answering promptly, after 20,458ms with that one request
 * held back 20s, and after 384ms with it answered here. A slow or absent
 * connection to Google stalled every boot, and read as a flaky suite — two
 * separate sweeps of the fixed sleeps found it the same day.
 *
 * So anything that is not this machine is answered HERE, empty, and at once.
 * Fonts are the only off-site resource any page loads, and a suite asserts
 * nothing about a typeface. The options object keeps jsdom's "usable"
 * behaviour as its baseline (its README: "Doing so will opt you in to the
 * above-described resources: "usable" behavior"), so everything local loads
 * exactly as before.
 *
 *   resources: localResources()      in place of   resources: "usable"
 *
 * `offSite` lists what was answered here, so a suite that wants to can say so.
 */
import jsdom from "jsdom";

const LOCAL = new Set(["127.0.0.1", "localhost", "[::1]"]);
const TYPE = { link: "text/css", script: "text/javascript" };

export const offSite = [];

export function localResources() {
  return {
    interceptors: [
      jsdom.requestInterceptor((request, { element }) => {
        if (LOCAL.has(new URL(request.url).hostname)) return undefined;
        offSite.push(request.url);
        const type = TYPE[element && element.localName] || "application/octet-stream";
        return new Response("", { headers: { "Content-Type": type } });
      }),
    ],
  };
}
