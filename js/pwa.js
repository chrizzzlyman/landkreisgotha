/* Installierbare Web-App: meldet den Service Worker an und zeigt (wenn das Gerät es anbietet) den Knopf "App installieren". */
(function () {
  'use strict';
  // Der Service Worker läuft nur über http(s) - also nicht, wenn die Datei per Doppelklick geöffnet wird.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* ohne geht es auch */ }); });
  }
  var knopf = document.getElementById('installknopf'), angebot = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();                 // Chrome zeigt dann nicht selbst die Leiste, sondern unseren Knopf
    angebot = e;
    if (knopf) knopf.hidden = false;
  });
  if (knopf) knopf.addEventListener('click', function () {
    if (!angebot) return;
    angebot.prompt();
    angebot.userChoice.then(function () { angebot = null; knopf.hidden = true; });
  });
  window.addEventListener('appinstalled', function () { angebot = null; if (knopf) knopf.hidden = true; });
})();
