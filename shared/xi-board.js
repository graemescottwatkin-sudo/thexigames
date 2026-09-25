/* xi-board.js — the pitch markings, drawn once for every board.
 *
 * The crossword carried this SVG in its page and Codeword a trimmed copy of
 * it; Grid would have been a third. Every empty .pitch-bg on the page gets the
 * crossword's markings here instead, and XIBoard.pitch(el) draws into one a
 * game builds later. The look is shared/xi-board.css.
 */
(function () {
  "use strict";
  var SVG =
    '<svg viewBox="0 0 1050 680" preserveAspectRatio="xMidYMid meet" focusable="false">' +
    '<g class="pl" fill="none" stroke-width="3">' +
    '<rect x="30" y="30" width="990" height="620"/>' +
    '<line x1="525" y1="30" x2="525" y2="650"/>' +
    '<circle cx="525" cy="340" r="91"/>' +
    '<circle cx="525" cy="340" r="7" class="spot"/>' +
    '<rect x="30" y="152" width="165" height="376"/>' +
    '<rect x="30" y="248" width="55" height="184"/>' +
    '<circle cx="140" cy="340" r="7" class="spot"/>' +
    '<path d="M195 249a91 91 0 0 1 0 182"/>' +
    '<rect x="855" y="152" width="165" height="376"/>' +
    '<rect x="965" y="248" width="55" height="184"/>' +
    '<circle cx="910" cy="340" r="7" class="spot"/>' +
    '<path d="M855 249a91 91 0 0 0 0 182"/>' +
    '<path d="M30 50a20 20 0 0 0 20-20"/>' +
    '<path d="M1020 50a20 20 0 0 1-20-20"/>' +
    '<path d="M30 630a20 20 0 0 1 20 20"/>' +
    '<path d="M1020 630a20 20 0 0 0-20 20"/>' +
    '<rect x="12" y="285" width="18" height="110"/>' +
    '<rect x="1020" y="285" width="18" height="110"/>' +
    "</g></svg>";

  function pitch(el) {
    if (el && !el.querySelector("svg")) el.innerHTML = SVG;
    return el;
  }
  function all() {
    var list = document.querySelectorAll(".pitch-bg");
    for (var i = 0; i < list.length; i++) pitch(list[i]);
  }

  window.XIBoard = { pitch: pitch, all: all };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", all);
  else all();
})();
