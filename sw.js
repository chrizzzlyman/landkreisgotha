/* Service Worker: macht die Karte installierbar und lässt sie ohne Internet starten.
   - Programmdateien: erst das Netz (damit Änderungen sofort ankommen), ohne Netz der gespeicherte Stand.
   - Höhenkacheln: einmal geladen, bleiben sie auf dem Gerät (die zuletzt angesehenen Gegenden gehen dann auch offline). */
var KERN = 'gotha-kern-v1';
var KACHELN = 'gotha-kacheln-v1';
var MAX_KACHELN = 600;
var DATEIEN = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css', 'css/hoehenlinien.svg',
  'lib/leaflet/leaflet.css', 'lib/leaflet/leaflet.js', 'lib/leaflet/images/layers.png', 'lib/leaflet/images/layers-2x.png',
  'lib/schriften/nunito-latin.woff2', 'lib/schriften/fredoka-latin.woff2',
  'data/grenzen.js', 'data/osm.js', 'data/siedlungen.js', 'data/landstrassen.js',
  'js/symbole.js', 'js/relief.js', 'js/beschriftung.js', 'js/quiz.js', 'js/export.js', 'js/app.js', 'js/pwa.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(KERN).then(function (cache) {
    // einzeln laden: fehlt eine Datei (z. B. optionale Daten), geht der Rest trotzdem
    return Promise.all(DATEIEN.map(function (d) { return cache.add(d).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (namen) {
    return Promise.all(namen.filter(function (n) { return n !== KERN && n !== KACHELN; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

function mitZeitlimit(p, ms) {
  return new Promise(function (ok, fehler) {
    var t = setTimeout(function () { fehler(new Error('Zeit')); }, ms);
    p.then(function (v) { clearTimeout(t); ok(v); }, function (err) { clearTimeout(t); fehler(err); });
  });
}

function netzZuerst(req) {
  return caches.open(KERN).then(function (cache) {
    return mitZeitlimit(fetch(req), 6000).then(function (res) {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(function (err) {
      return cache.match(req, { ignoreSearch: true }).then(function (treffer) {
        if (treffer) return treffer;
        if (req.mode === 'navigate') return cache.match('index.html');
        throw err;
      });
    });
  });
}

function kachelHolen(req) {
  return caches.open(KACHELN).then(function (cache) {
    return cache.match(req).then(function (treffer) {
      if (treffer) return treffer;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          cache.put(req, res.clone());
          cache.keys().then(function (k) { if (k.length > MAX_KACHELN) k.slice(0, k.length - MAX_KACHELN).forEach(function (r) { cache.delete(r); }); });
        }
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(netzZuerst(req));
  else if (/elevation-tiles-prod\/terrarium\//.test(url.href)) e.respondWith(kachelHolen(req));
});
