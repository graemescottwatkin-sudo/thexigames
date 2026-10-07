/* /account/delete — how to delete your account, for anyone who asks.
 *
 * Google Play requires a web address where a player can find out how to delete
 * their account and what goes; the owner's spec of 6 Oct 2026 put it here,
 * public and indexable, since it is a page about the site rather than a game.
 * It explains; it deletes nothing. The button is in the account panel, where a
 * signed-in player is, and the email is for anyone who cannot reach it.
 */
import { sitePage, htmlResponse } from "../_lib/site-page.js";
import { DELETED_NAME } from "../_lib/account-delete.js";

export async function onRequestGet() {
  const body = `<h1>Delete your account</h1>
<p class="sub">You can delete your The XI Games account yourself, at any time, and it happens at once.</p>
<h2>How</h2>
<ol>
<li>Open any game on thexigames.com, or in The XI Games app, and sign in.</li>
<li>Open your account (the <strong>Account</strong> button, or <strong>Settings</strong> &rarr; Account).</li>
<li>Choose <strong>Delete account</strong>, read what goes, type <strong>DELETE</strong> and confirm.</li>
</ol>
<p>If you signed in with Apple, delete your account in The XI Games app on your iPhone or iPad: Apple asks you to confirm, and your Sign in with Apple link to us is removed too.</p>
<h2>What is deleted</h2>
<ul>
<li>Your account and how you sign in to it</li>
<li>Your results, streaks and season</li>
<li>Any boards you had in progress</li>
<li>Reminders sent to your account</li>
</ul>
<p>In a challenge you entered or created, the other players keep their scores; your name is replaced with &ldquo;${DELETED_NAME}&rdquo; and any group name you gave a challenge is removed. Clue reports and theme requests you sent are kept without your account attached. Play records are anonymous and were never linked to you.</p>
<p>You can also choose to clear this device, which removes everything the games have saved in your browser or the app.</p>
<h2>Can't sign in?</h2>
<p>Email <strong>privacy@thexigames.com</strong> from the address on your account and we will delete it for you.</p>
<a class="cta ghost" href="/football/crossword/privacy.html">Privacy policy</a>`;
  return htmlResponse(sitePage({
    title: "Delete your account | The XI Games",
    description: "How to delete your The XI Games account, and what is deleted when you do.",
    canonical: "https://www.thexigames.com/account/delete",
    body,
  }), { maxAge: 3600 });
}
