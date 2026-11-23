/* Eigene Symbole (SVG) – damit nichts als leeres Kästchen erscheint, egal welches Gerät.
   Benutzung: Gotha.Symbole.svg('stadt', 24)  oder im HTML  <span data-sym="suche"></span> */
(function () {
  'use strict';
  var NS = window.Gotha = window.Gotha || {};

  // Alle Symbole sind auf einem 24×24-Raster gezeichnet. Linien: currentColor, Füllungen: "f"-Elemente.
  var P = {
    kreis: '<path d="M7.5 3.8 14 3l5.6 4.3.9 6.4-3.6 5.9-6.6 1.7L4.6 16 3.4 9.6z" fill="currentColor" fill-opacity=".22"/>',
    gemeinden: '<path d="M3.5 7.8 9 3.6l7 .5 4.5 5-1.5 8-8 3.6-6.5-5z" fill="currentColor" fill-opacity=".16"/><path d="M9 3.6l2.6 7L4.5 15.6M11.6 10.6l7.6 1M11.6 10.6 11 20.6"/>',
    stadt: '<path d="M3.5 20.5V9.5L8.5 7v13.5M8.5 20.5V4.5h7.5v16M16 20.5v-9l4.5 1.5v7.5M2.5 20.5h19"/><path d="M11 8.5h2.5M11 12h2.5M11 15.5h2.5" stroke-width="1.8"/>',
    dorf: '<path d="M3.5 11.5 12 4.5l8.5 7M6 10v10h12V10M10 20v-5.5h4V20"/><path d="M16.5 7.5V4.8h2v4.2" stroke-width="1.8"/>',
    wasser: '<path d="M2.5 8.5c2.4-2.8 4.6-2.8 7 0s4.6 2.8 7 0 3.7-2.2 5-.9M2.5 13.5c2.4-2.8 4.6-2.8 7 0s4.6 2.8 7 0 3.7-2.2 5-.9M2.5 18.5c2.4-2.8 4.6-2.8 7 0s4.6 2.8 7 0 3.7-2.2 5-.9"/>',
    berg: '<path d="M2 20 9.5 6.5 13.2 13l2.6-3.6L22 20z" fill="currentColor" fill-opacity=".2"/><path d="M7.6 10l1.9 1.6 1.4-1.2" stroke-width="1.7"/>',
    suche: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    haus: '<path d="M3.5 11.5 12 4l8.5 7.5M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    menue: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    schliessen: '<path d="m6 6 12 12M18 6 6 18"/>',
    haken: '<path d="m5 12.5 4.5 4.5L19 7.5" stroke-width="3"/>',
    quiz: '<path d="M12 21.5S5.5 16 5.5 10.2a6.5 6.5 0 0 1 13 0C18.5 16 12 21.5 12 21.5z" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="10.2" r="2.4"/>',
    frage: '<circle cx="12" cy="12" r="9.2"/><path d="M9.2 9.4a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.3-2.8 4.1M12 17.6v.1" stroke-width="2.2"/>',
    stern: '<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" fill="currentColor" stroke-linejoin="round"/>',
    sternLeer: '<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" fill="none" stroke-linejoin="round"/>',
    tipp: '<path d="M9 17.5h6M10 20.5h4M12 3.2a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.1v1.4h5v-1.4c0-.8.4-1.5 1.1-2.1A6 6 0 0 0 12 3.2z"/>',
    nochmal: '<path d="M20 12a8 8 0 1 1-2.6-5.9M20 4.5v4.6h-4.6"/>',
    pfeilKarte: '<path d="M4.5 4.5 19.5 10l-6.2 2.2L11 19.5z" fill="currentColor" fill-opacity=".25"/>',
    ganz: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    strasse: '<path d="M8.5 21 10.8 3M15.5 21 13.2 3"/><path d="M12 20v-3.5M12 13.5V10M12 7V4.5" stroke-width="2"/>',
    tropfen: '<path d="M12 3.5s6 6.2 6 10.3a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5z" fill="currentColor" fill-opacity=".2"/>',
    ort: '<path d="M12 21.5S5.5 16 5.5 10.2a6.5 6.5 0 0 1 13 0C18.5 16 12 21.5 12 21.5z"/><circle cx="12" cy="10.2" r="2.2"/>',
    hand: '<path d="M9 11V5.6a1.6 1.6 0 0 1 3.2 0V10m0-1.2a1.6 1.6 0 0 1 3.2 0V11m0-.5a1.6 1.6 0 0 1 3.2 0v4.4c0 3.6-2.4 6.1-5.8 6.1-2.6 0-4-1.1-5.4-3.1L4.2 14a1.6 1.6 0 0 1 2.5-1.9L9 14.2"/>',
    schalter: '<rect x="2.8" y="7" width="18.4" height="10" rx="5"/><circle cx="16" cy="12" r="2.6" fill="currentColor"/>',
    pokal: '<path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0zM7.5 6H4.2c0 3 1.2 4.6 3.6 5M16.5 6h3.3c0 3-1.2 4.6-3.6 5M12 13.7V17M8.5 20.5h7M9.5 17h5"/>'
  };

  function svg(name, groesse, klasse) {
    var g = groesse || 24;
    return '<svg class="sym' + (klasse ? ' ' + klasse : '') + '" viewBox="0 0 24 24" width="' + g + '" height="' + g + '" aria-hidden="true" focusable="false" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || P.ort) + '</svg>';
  }

  // Umriss des Landkreises als Logo (aus den echten Grenzdaten)
  function umriss(feature, flaeche) {
    try {
      var ring = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0][0];
      var lat0 = 0; ring.forEach(function (p) { lat0 += p[1]; }); lat0 /= ring.length;
      var k = Math.cos(lat0 * Math.PI / 180), minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      var pts = ring.map(function (p) { return [p[0] * k, -p[1]]; });
      pts.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
      var sc = (flaeche - 8) / Math.max(maxx - minx, maxy - miny), ox = (flaeche - (maxx - minx) * sc) / 2, oy = (flaeche - (maxy - miny) * sc) / 2;
      var schritt = Math.max(1, Math.floor(pts.length / 110));
      var d = '';
      for (var i = 0; i < pts.length; i += schritt) d += (d ? 'L' : 'M') + ((pts[i][0] - minx) * sc + ox).toFixed(1) + ' ' + ((pts[i][1] - miny) * sc + oy).toFixed(1);
      return d + 'Z';
    } catch (e) { return ''; }
  }
  function logo(klasse) {
    var G = window.GOTHA_GRENZEN, d = G && G.kreis ? umriss(G.kreis, 64) : '';
    return '<svg class="logo-svg ' + (klasse || '') + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<path d="' + d + '" fill="var(--logo-fuell, #e8590c)" stroke="var(--logo-rand, #fff)" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke"/></svg>';
  }

  NS.Symbole = { svg: svg, logo: logo, namen: Object.keys(P) };

  // Platzhalter im HTML ersetzen
  function fuelle() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-sym]'), function (el) {
      el.innerHTML = svg(el.getAttribute('data-sym'), +el.getAttribute('data-gr') || 24);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-logo]'), function (el) { el.innerHTML = logo(el.getAttribute('data-logo')); });
  }
  fuelle();
})();
