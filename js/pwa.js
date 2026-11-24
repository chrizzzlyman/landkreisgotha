/* Installierbare Web-App: meldet den Service Worker an und zeigt (wenn das Gerät es anbietet) den Knopf "App installieren". */
(function () {
  'use strict';
  // Der Service Worker läuft nur über http(s) - also nicht, wenn die Datei per Doppelklick geöffnet wird.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    var hatteSW = !!navigator.serviceWorker.controller, geladen = Date.now();
    window.addEventListener('load', function () {
      // updateViaCache 'none': die Datei sw.js wird nie aus dem Browser-Zwischenspeicher genommen.
      // update(): sofort nachsehen, ob es eine neue Version gibt (sonst wartet der Browser bis zu einem Tag).
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        reg.update().catch(function () {});
        // Eine installierte App bleibt oft lange offen: beim Zurückkommen noch einmal nachsehen.
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
      }).catch(function () { /* ohne geht es auch */ });
    });
    // Hat gerade eine neue Version übernommen, während die Seite noch ganz frisch ist: einmal neu laden, damit sie sofort zu sehen ist.
    var neugeladen = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hatteSW || neugeladen || Date.now() - geladen > 15000) return;
      neugeladen = true; location.reload();
    });
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
