/* Unser Landkreis Gotha – Kartenentdecker (Hauptprogramm) */
(function () {
  'use strict';
  var NS = window.Gotha = window.Gotha || {};
  var G = window.GOTHA_GRENZEN, O = window.GOTHA_OSM || null;
  function $(id) { return document.getElementById(id); }

  if (!window.L || !G) {
    $('karte').innerHTML = '<p style="padding:24px;font-weight:800">Die Kartendaten konnten nicht geladen werden. Bitte lade die Seite neu.</p>';
    return;
  }

  function ll(c) { return L.latLng(c[1], c[0]); }
  function km(x) { return (Math.round(x * 10) / 10).toString().replace('.', ','); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s).toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ''); }

  // ------------------------------------------------------------ Daten vorbereiten
  var gemFeat = G.gemeinden.features;
  var gemProp = {};
  gemFeat.forEach(function (f) { gemProp[f.properties.id] = f.properties; });
  var kreisMitte = ll(G.kreis.properties.l);
  var grenzen = L.latLngBounds([G.grenzen[0], G.grenzen[1]], [G.grenzen[2], G.grenzen[3]]);

  var ORTE = [];
  if (O && O.orte && O.orte.length) {
    O.orte.forEach(function (o, i) { ORTE.push({ id: 'ort:' + i, n: o.n, t: o.t, ll: ll(o.p), g: o.g, e: o.e }); });
  } else {      // ohne OSM-Daten: wenigstens die 5 Städte (Mittelpunkt der Gemeindefläche)
    gemFeat.filter(function (f) { return f.properties.art === 'Stadt'; }).forEach(function (f) {
      ORTE.push({ id: 'ort:' + f.properties.n, n: f.properties.n, t: 'stadt', ll: ll(f.properties.l), g: f.properties.id });
    });
  }
  var BERGE = (O && O.berge) || [];
  var STRASSEN = (O && O.strassen) || [];
  var WASSER = (O && O.wasser) || [];
  var SEEN = (O && O.seen) || [];
  var SIEDLUNG = (window.GOTHA_SIEDLUNGEN && window.GOTHA_SIEDLUNGEN.flaechen) || [];
  var LANDSTR = (window.GOTHA_LANDSTRASSEN && window.GOTHA_LANDSTRASSEN.strassen) || [];
  var WEITERE = (window.GOTHA_LANDSTRASSEN && window.GOTHA_LANDSTRASSEN.weitere) || [];

  var ZIELE = {};          // id -> {art, kat, name, typ:'punkt'|'flaeche'|'linie', ll, feature, c, daten}
  function registriere(id, z) { z.id = id; ZIELE[id] = z; return z; }

  // ------------------------------------------------------------ Ebenen
  var hatA = STRASSEN.some(function (s) { return s.k === 'A'; });
  var hatB = STRASSEN.some(function (s) { return s.k === 'B'; });
  var ersteA = (STRASSEN.filter(function (s) { return s.k === 'A'; })[0] || { r: 'A 4' }).r;
  var ersteB = (STRASSEN.filter(function (s) { return s.k === 'B'; })[0] || { r: 'B 7' }).r;
  var ersteL = (LANDSTR.filter(function (s) { return s.k === 'L'; })[0] || { r: 'L 1026' }).r;
  var SYM = NS.Symbole;
  // farbe = Farbe der Kachel (wenn eingeschaltet), hell = Farbe des Symbolkreises (wenn ausgeschaltet), text = Schriftfarbe auf der Kachel
  var EBENEN = [
    { id: 'kreis', gruppe: 'Grenzen', sym: 'kreis', titel: 'Landkreis & Nachbarn', farbe: '#c2410c', hell: '#ffe8cc', an: true, daten: true },
    { id: 'gemeinden', gruppe: 'Grenzen', sym: 'gemeinden', titel: 'Gemeinden', farbe: '#862e9c', hell: '#f3d9fa', an: false, daten: true },
    { id: 'staedte', gruppe: 'Orte', sym: 'stadt', titel: 'Städte', farbe: '#c92a2a', hell: '#ffe3e3', an: true, daten: true },
    { id: 'doerfer', gruppe: 'Orte', sym: 'dorf', titel: 'Dörfer', farbe: '#ffb020', hell: '#fff0d0', text: '#16304a', an: false, daten: ORTE.some(function (o) { return o.t === 'dorf'; }) },
    { id: 'umrisse', gruppe: 'Orte', breit: true, sym: 'umriss', titel: 'Umrisse der Orte', farbe: '#a61e4d', hell: '#ffdeeb', an: false, daten: SIEDLUNG.length > 0 },
    { id: 'wasser', gruppe: 'Natur', sym: 'wasser', titel: 'Flüsse & Seen', farbe: '#1c6fc2', hell: '#d0ebff', an: false, daten: WASSER.length + SEEN.length > 0 },
    { id: 'berge', gruppe: 'Natur', sym: 'berg', titel: 'Berge & Täler', farbe: '#8c5a2b', hell: '#f0dcc3', an: false, daten: true },
    { id: 'autobahn', gruppe: 'Straßen', schild: '<span class="schild autobahn">' + esc(ersteA) + '</span>', titel: 'Auto\u00ADbahnen', farbe: '#1d4ed8', hell: '#dbe4ff', an: false, daten: hatA },
    { id: 'bundesstr', gruppe: 'Straßen', schild: '<span class="schild bundesstr">' + esc(ersteB) + '</span>', titel: 'Bundes\u00ADstraßen', farbe: '#ffd43b', hell: '#fff3bf', text: '#16304a', an: false, daten: hatB },
    { id: 'landstr', gruppe: 'Straßen', breit: true, schild: '<span class="schild landstr">' + esc(ersteL) + '</span>', titel: 'Landstraßen', farbe: '#4a5b6e', hell: '#e8edf2', an: false, daten: LANDSTR.length > 0 }
  ];
  var an = {};
  EBENEN.forEach(function (e) { an[e.id] = e.daten && e.an; });

  // ------------------------------------------------------------ Karte
  var map = L.map('karte', {
    zoomControl: false, attributionControl: false, minZoom: 9, maxZoom: 15, zoomSnap: 0.25, zoomDelta: 1,
    maxBounds: grenzen.pad(0.9), maxBoundsViscosity: 0.8, wheelPxPerZoomLevel: 100, tap: true
  });
  L.control.zoom({ position: 'topleft', zoomInTitle: 'Größer', zoomOutTitle: 'Kleiner' }).addTo(map);
  L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 140 }).addTo(map);
  L.control.attribution({ position: 'bottomright', prefix: false })
    .addTo(map).addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a> · © GeoBasis-DE / BKG');
  [['reliefPane', 250], ['nachbarPane', 310], ['kreisFlaechePane', 320], ['gemeindePane', 330], ['umrissPane', 335], ['seePane', 340], ['wasserPane', 350],
   ['kreisLiniePane', 380], ['landRandPane', 400], ['landKernPane', 405], ['strassenPane', 420], ['punktPane', 450], ['trefferLinienPane', 460], ['trefferPane', 470], ['hervorPane', 480]].forEach(function (p) {
    map.createPane(p[0]).style.zIndex = p[1];
  });
  map.getPane('trefferPane').style.cursor = 'pointer';
  map.getPane('trefferLinienPane').style.cursor = 'pointer';

  var PASTELL = ['#ffd8d8', '#d3f9d8', '#cfe8ff', '#fff0b3', '#f0d4fa', '#ffe0c2', '#c5f6fa', '#e6e8eb', '#e0f0b8', '#ffd6e8', '#d8d4ff', '#d0f0e0'];

  function skala() { return Math.max(0.78, Math.min(1.9, 1 + (map.getZoom() - 10) * 0.18)); }
  function reliefAn() { return !!an.berge; }

  // ------------------------------------------------------------ Tippen / Popups
  var quiz = null;
  function tippe(id, latlng) {
    if (quiz && quiz.aktiv()) { quiz.antwort(id, latlng); return; }
    L.popup({ maxWidth: 300, autoPanPadding: [30, 30], closeButton: true })
      .setLatLng(latlng).setContent(infoHtml(id)).openOn(map);
  }
  // Zuordnung "Art" -> Symbol und Farben (Chip im Popup, Symbol in der Suche)
  var ART_STIL = {
    'Stadt': ['stadt', '#c92a2a', '#ffe3e3'], 'Stadt außerhalb': ['stadt', '#3f4f5f', '#e9edf1'], 'Dorf': ['dorf', '#8a4b00', '#fff0d0'], 'Kleiner Ort': ['dorf', '#8a4b00', '#fff0d0'],
    'Gemeinde': ['gemeinden', '#862e9c', '#f3d9fa'], 'Fluss': ['wasser', '#1c6fc2', '#d0ebff'], 'Bach': ['wasser', '#1c6fc2', '#d0ebff'], 'Kanal': ['wasser', '#1c6fc2', '#d0ebff'],
    'See': ['tropfen', '#1c6fc2', '#d0ebff'], 'Talsperre': ['tropfen', '#1c6fc2', '#d0ebff'], 'Stausee': ['tropfen', '#1c6fc2', '#d0ebff'], 'Teich': ['tropfen', '#1c6fc2', '#d0ebff'],
    'Autobahn': ['strasse', '#1d4ed8', '#dbe4ff'], 'Bundesstraße': ['strasse', '#7a5a00', '#fff3bf'], 'Landesstraße': ['strasse', '#4a5b6e', '#e8edf2'], 'Kreisstraße': ['strasse', '#4a5b6e', '#e8edf2'], 'Nachbarkreis': ['kreis', '#46607a', '#e9edf1'], 'Nachbar': ['kreis', '#46607a', '#e9edf1'],
    'Landkreis': ['kreis', '#c2410c', '#ffe8cc'], 'Berg': ['berg', '#8c5a2b', '#f0dcc3']
  };
  function artStil(text) { return ART_STIL[String(text).split(' · ')[0]] || (String(text).indexOf('Berg') === 0 ? ART_STIL['Berg'] : ['ort', '#16304a', '#e6eff7']); }
  function art(text) { var s = artStil(text); return '<span class="art" style="--art-farbe:' + s[1] + ';--art-hell:' + s[2] + '">' + SYM.svg(s[0], 16) + esc(text) + '</span>'; }
  function gemName(ags) { var g = gemProp[ags]; return g ? (g.art === 'Stadt' ? 'Stadt ' : 'Gemeinde ') + g.n : null; }

  function infoHtml(id) {
    var z = ZIELE[id] || {}, d = z.daten || {};
    if (z.art === 'kreis') {
      var staedte = gemFeat.filter(function (f) { return f.properties.art === 'Stadt'; }).length;
      return art('Landkreis') + '<h3>Landkreis Gotha</h3><p>' + gemFeat.length + ' Gemeinden, davon ' + staedte + ' Städte.</p><p>Fläche: etwa ' + Math.round(G.kreis.properties.km2) + ' km²</p><p>Kreisstadt: Gotha</p><p>Auf den Autos steht <strong>GTH</strong>.</p>';
    }
    if (z.art === 'nachbar') {
      var extra = d.n === 'Stadt Erfurt' ? '<p>Erfurt ist die Hauptstadt von Thüringen.</p>' : '';
      return art('Nachbar') + '<h3>' + esc(d.n) + '</h3><p>Liegt im <strong>' + esc(d.r) + '</strong> von unserem Landkreis.</p>' + extra;
    }
    if (z.art === 'gemeinde') {
      var dorfListe = ORTE.filter(function (o) { return o.g === d.id && o.n !== d.n && (o.t === 'dorf'); }).map(function (o) { return o.n; }).sort();
      var s = art(d.art) + '<h3>' + esc(d.n) + '</h3><p>Fläche: etwa ' + km(d.km2) + ' km²</p>';
      if (dorfListe.length) s += '<p>Dazu gehören auch: ' + esc(dorfListe.slice(0, 10).join(', ')) + (dorfListe.length > 10 ? ' …' : '') + '</p>';
      return s;
    }
    if (z.art === 'ort') {
      var gn = gemName(d.g), s2;
      if (d.t === 'stadt') {
        s2 = art('Stadt') + '<h3>' + esc(d.n) + '</h3>' + (d.n === 'Gotha' ? '<p>Gotha ist die Kreisstadt des Landkreises.</p>' : '<p>Eine Stadt in unserem Landkreis.</p>');
      } else if (d.t === 'nachbarstadt') {
        s2 = art('Stadt außerhalb') + '<h3>' + esc(d.n) + '</h3><p>Diese Stadt liegt nicht im Landkreis Gotha.</p>' + (d.n === 'Erfurt' ? '<p>Erfurt ist die Hauptstadt von Thüringen.</p>' : '');
      } else {
        s2 = art(d.t === 'weiler' ? 'Kleiner Ort' : 'Dorf') + '<h3>' + esc(d.n) + '</h3>';
        if (gn && gemProp[d.g].n !== d.n) s2 += '<p>Gehört zu: <strong>' + esc(gn) + '</strong></p>';
        else if (gn) s2 += '<p>Das ist auch eine eigene Gemeinde.</p>';
      }
      return s2;
    }
    if (z.art === 'berg') {
      return art('Berg') + '<h3>' + esc(d.n) + '</h3><p>Höhe: <strong>' + d.h + ' m</strong> über dem Meeresspiegel</p>' + (BERGE[0] && BERGE[0].h === d.h && BERGE[0].n === d.n ? '<p>Das ist der höchste Berg im Landkreis!</p>' : '');
    }
    if (z.art === 'wasser') {
      var wort = d.k === 'bach' ? 'Bach' : d.k === 'kanal' ? 'Kanal' : 'Fluss';
      return art(wort) + '<h3>' + esc(d.n) + '</h3><p>Länge im Landkreis: etwa ' + km(d.km) + ' km</p>';
    }
    if (z.art === 'see') {
      var w2 = d.k === 'talsperre' ? 'Talsperre' : d.k === 'stausee' ? 'Stausee' : d.k === 'teich' ? 'Teich' : 'See';
      return art(w2) + '<h3>' + esc(d.n) + '</h3>' + (d.k === 'talsperre' || d.k === 'stausee' ? '<p>Hier wird das Wasser eines Baches oder Flusses zurückgehalten.</p>' : '');
    }
    if (z.art === 'strasse') {
      if (d.k === 'L' || d.k === 'K') {
        var land = d.k === 'L';
        return art(land ? 'Landesstraße' : 'Kreisstraße') + '<h3>' + esc(d.r) + '</h3><p>Länge im Landkreis: etwa ' + km(d.km) + ' km</p><p>' + (land ? 'Auf Landesstraßen kommst du von Ort zu Ort. Sie gehören dem Land Thüringen.' : 'Kreisstraßen verbinden Dörfer miteinander. Sie gehören dem Landkreis.') + '</p>';
      }
      var autob = d.k === 'A';
      return art(autob ? 'Autobahn' : 'Bundesstraße') + '<h3>' + esc(d.r) + '</h3><p>Länge im Landkreis: etwa ' + km(d.km) + ' km</p><p>' + (autob ? 'Autobahnen haben blaue Schilder.' : 'Bundesstraßen haben gelbe Schilder.') + '</p>';
    }
    return '';
  }

  // ------------------------------------------------------------ Ebene: Kreis & Nachbarn
  function nachbarStil() {
    return reliefAn() ? { color: '#6c757d', weight: 2, fillColor: '#ffffff', fillOpacity: 0.6 }
                      : { color: '#868e96', weight: 2, fillColor: '#e4e7ea', fillOpacity: 0.95 };
  }
  var nachbarSchicht = L.geoJSON(G.nachbarn, {
    pane: 'nachbarPane', style: nachbarStil,
    onEachFeature: function (f, layer) {
      var id = 'nachbar:' + f.properties.id;
      registriere(id, { art: 'nachbar', kat: 'nachbar', name: f.properties.n, typ: 'flaeche', feature: f, daten: f.properties, ll: ll(f.properties.l) });
      layer.on('click', function (e) { L.DomEvent.stop(e); tippe(id, e.latlng); });
    }
  });
  registriere('kreis', { art: 'kreis', kat: 'kreis', name: 'Landkreis Gotha', typ: 'flaeche', feature: G.kreis, daten: G.kreis.properties, ll: kreisMitte });
  function kreisFlaechenStil() { return { stroke: false, fillColor: '#fff3bf', fillOpacity: reliefAn() ? 0.001 : 0.4 }; }
  var kreisFlaeche = L.geoJSON(G.kreis, {
    pane: 'kreisFlaechePane', style: kreisFlaechenStil,
    onEachFeature: function (f, layer) { layer.on('click', function (e) { L.DomEvent.stop(e); tippe('kreis', e.latlng); }); }
  });
  var kreisLinie = L.layerGroup([
    L.geoJSON(G.kreis, { pane: 'kreisLiniePane', interactive: false, style: { fill: false, color: '#ffffff', weight: 10, opacity: 0.7, lineJoin: 'round' } }),
    L.geoJSON(G.kreis, { pane: 'kreisLiniePane', interactive: false, style: { fill: false, color: '#d9480f', weight: 5, lineJoin: 'round' } })
  ]);
  var gruppeKreis = L.layerGroup([nachbarSchicht, kreisFlaeche, kreisLinie]);

  // ------------------------------------------------------------ Ebene: Gemeinden
  var gemeindeLayer = {};
  function gemeindeStil(f) {
    return { color: '#862e9c', weight: 2.6 * Math.min(skala(), 1.4), dashArray: '9 6', lineJoin: 'round',
             fillColor: PASTELL[f.properties.f % PASTELL.length], fillOpacity: reliefAn() ? 0.001 : 0.6 };
  }
  var gemeindeSchicht = L.geoJSON(G.gemeinden, {
    pane: 'gemeindePane', style: gemeindeStil,
    onEachFeature: function (f, layer) {
      var id = 'gemeinde:' + f.properties.id;
      registriere(id, { art: 'gemeinde', kat: 'gemeinde', name: f.properties.n, typ: 'flaeche', feature: f, daten: f.properties, ll: ll(f.properties.l) });
      gemeindeLayer[id] = layer;
      layer.on('click', function (e) { L.DomEvent.stop(e); tippe(id, e.latlng); });
    }
  });
  var gruppeGemeinden = L.layerGroup([gemeindeSchicht]);

  // ------------------------------------------------------------ Ebene: Umrisse der Orte (grobe Siedlungsflächen)
  function umrissStil(f) {
    var sk = skala(), stadt = f.properties.t === 'stadt';
    return { color: stadt ? '#c92a2a' : '#e8590c', weight: 1.6 * Math.min(sk, 1.3), lineJoin: 'round',
             fillColor: stadt ? '#ff8787' : '#ffc078', fillOpacity: 0.62 };
  }
  var umrissSchicht = L.geoJSON(SIEDLUNG.map(function (s) { return { type: 'Feature', properties: { t: s.t, n: s.n }, geometry: s.f }; }),
    { pane: 'umrissPane', interactive: false, style: umrissStil });
  var gruppeUmrisse = L.layerGroup([umrissSchicht]);

  // ------------------------------------------------------------ Ebene: Städte / Dörfer
  var STIL = {
    stadt: { r: 9, fill: '#e03131', rand: 3 },
    nachbarstadt: { r: 7, fill: '#868e96', rand: 2.5 },
    dorf: { r: 6, fill: '#f08c00', rand: 2.5 },
    weiler: { r: 4, fill: '#a47c48', rand: 2 }
  };
  var gruppeStaedte = L.layerGroup(), gruppeDoerfer = L.layerGroup(), gruppeWeiler = L.layerGroup();
  ORTE.forEach(function (o) {
    var s = STIL[o.t] || STIL.dorf;
    registriere(o.id, { art: 'ort', kat: o.t === 'weiler' ? 'dorf' : o.t, name: o.n, typ: 'punkt', ll: o.ll, daten: o });
    var punkt = L.circleMarker(o.ll, { pane: 'punktPane', radius: s.r, fillColor: s.fill, fillOpacity: 1, color: '#fff', weight: s.rand, interactive: false });
    var treffer = L.circleMarker(o.ll, { pane: 'trefferPane', radius: Math.max(s.r + 8, 17), stroke: false, fillColor: '#000', fillOpacity: 0.001 });
    treffer.on('click', function (e) { L.DomEvent.stop(e); tippe(o.id, o.ll); });
    var ziel = (o.t === 'stadt' || o.t === 'nachbarstadt') ? gruppeStaedte : (o.t === 'weiler' ? gruppeWeiler : gruppeDoerfer);
    ziel.addLayer(punkt); ziel.addLayer(treffer);
  });

  // ------------------------------------------------------------ Ebene: Gewässer
  var gruppeWasser = L.layerGroup(), wasserLinien = [];
  var WASSER_STIL = { fluss: { b: 4.2, c: '#2b8ae0' }, kanal: { b: 3, c: '#4aa3ea' }, bach: { b: 2.6, c: '#5eb0f0' } };
  WASSER.forEach(function (w, i) {
    var id = 'wasser:' + w.n;
    var teile = w.c.map(function (t) { return t.map(ll); });
    registriere(id, { art: 'wasser', kat: w.k === 'bach' ? 'bach' : 'fluss', name: w.n, typ: 'linie', c: teile, daten: w, ll: teile[0][Math.floor(teile[0].length / 2)] });
    var linie = L.polyline(teile, { pane: 'wasserPane', color: WASSER_STIL[w.k].c, weight: WASSER_STIL[w.k].b, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false });
    var treffer = L.polyline(teile, { pane: 'trefferLinienPane', color: '#000', weight: 20, opacity: 0.001, lineCap: 'round' });
    treffer.on('click', function (e) { L.DomEvent.stop(e); tippe(id, e.latlng); });
    wasserLinien.push({ w: w, linie: linie });
    gruppeWasser.addLayer(linie); gruppeWasser.addLayer(treffer);
    w._ll = teile;
  });
  SEEN.forEach(function (s, i) {
    var id = 'see:' + i;
    var feat = { type: 'Feature', geometry: s.f, properties: {} };
    var schicht = L.geoJSON(feat, { pane: 'seePane', style: { color: '#1c7ed6', weight: 2, fillColor: '#74c0fc', fillOpacity: 0.95 } });
    schicht.on('click', function (e) { L.DomEvent.stop(e); tippe(id, e.latlng); });
    registriere(id, { art: 'see', kat: 'see', name: s.n, typ: 'flaeche', feature: feat, daten: s, ll: ll(s.a) });
    gruppeWasser.addLayer(schicht);
  });

  // ------------------------------------------------------------ Ebene: Straßen
  var gruppeAutobahn = L.layerGroup(), gruppeBundesstr = L.layerGroup(), strassenLinien = [];
  STRASSEN.forEach(function (s) {
    var id = 'strasse:' + s.r;
    var teile = s.c.map(function (t) { return t.map(ll); });
    registriere(id, { art: 'strasse', kat: 'strasse', name: s.r, typ: 'linie', c: teile, daten: s, ll: teile[0][Math.floor(teile[0].length / 2)] });
    var rand = L.polyline(teile, { pane: 'strassenPane', color: s.k === 'A' ? '#0b1f5c' : '#6b4f00', weight: 10, lineCap: 'round', lineJoin: 'round', interactive: false });
    var kern = L.polyline(teile, { pane: 'strassenPane', color: s.k === 'A' ? '#1d4ed8' : '#ffd43b', weight: 6, lineCap: 'round', lineJoin: 'round', interactive: false });
    var treffer = L.polyline(teile, { pane: 'trefferLinienPane', color: '#000', weight: 22, opacity: 0.001, lineCap: 'round' });
    treffer.on('click', function (e) { L.DomEvent.stop(e); tippe(id, e.latlng); });
    strassenLinien.push({ s: s, rand: rand, kern: kern });
    var g = s.k === 'A' ? gruppeAutobahn : gruppeBundesstr;
    g.addLayer(rand); g.addLayer(kern); g.addLayer(treffer);
    s._ll = teile;
  });

  // ------------------------------------------------------------ Ebene: Landstraßen (Landesstraßen L, Kreisstraßen K, weitere Durchgangsstraßen)
  var LAND_STIL = {
    L: { rand: '#4d5d70', kern: '#ffffff', wr: 7.6, wk: 4.6 },
    K: { rand: '#72839a', kern: '#ffffff', wr: 6.0, wk: 3.4 },
    W: { rand: '#9aa8b8', kern: '#ffffff', wr: 4.4, wk: 2.2 }
  };
  var gruppeLandstr = L.layerGroup(), gruppeWeitere = L.layerGroup(), landLinien = [];
  (function () {
    function paar(teile, st, id) {
      var rand = L.polyline(teile, { pane: 'landRandPane', color: st.rand, weight: st.wr, lineCap: 'round', lineJoin: 'round', interactive: false });
      var kern = L.polyline(teile, { pane: 'landKernPane', color: st.kern, weight: st.wk, lineCap: 'round', lineJoin: 'round', interactive: false });
      return { rand: rand, kern: kern, st: st };
    }
    var w = paar(WEITERE.map(function (t) { return t.map(ll); }), LAND_STIL.W);
    gruppeWeitere.addLayer(w.rand); gruppeWeitere.addLayer(w.kern); landLinien.push(w);
    LANDSTR.forEach(function (s) {
      var id = 'strasse:' + s.r;
      var teile = s.c.map(function (t) { return t.map(ll); });
      registriere(id, { art: 'strasse', kat: 'strasse', name: s.r, typ: 'linie', c: teile, daten: s, ll: teile[0][Math.floor(teile[0].length / 2)] });
      var p = paar(teile, LAND_STIL[s.k]);
      var treffer = L.polyline(teile, { pane: 'trefferLinienPane', color: '#000', weight: 20, opacity: 0.001, lineCap: 'round' });
      treffer.on('click', function (e) { L.DomEvent.stop(e); tippe(id, e.latlng); });
      gruppeLandstr.addLayer(p.rand); gruppeLandstr.addLayer(p.kern); gruppeLandstr.addLayer(treffer);
      landLinien.push(p);
      s._ll = teile;
    });
  })();

  // ------------------------------------------------------------ Ebene: Berge & Täler (Höhenkarte + Gipfel)
  var gruppeGipfel = L.layerGroup();
  // Es gibt nur acht Berge, und alle sollen sofort zu sehen sein (Ab Zoomstufe 9 = ganz herausgezoomt).
  function gipfelAb() { return 9; }
  var gipfelMarker = [];
  BERGE.forEach(function (b, i) {
    var id = 'berg:' + i;
    registriere(id, { art: 'berg', kat: 'berg', name: b.n, typ: 'punkt', ll: ll(b.p), daten: b });
    var m = L.marker(ll(b.p), { icon: L.divIcon({ className: 'gipfel', html: '<svg viewBox="0 0 26 22" aria-hidden="true"><path d="M13 2 24 20H2z" fill="#7f3f12" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke"/><path d="M13 2l4.4 7.2-2.2-1.4L13 9.8l-2.2-2-2.2 1.4z" fill="#fff" fill-opacity=".85"/></svg>', iconSize: [26, 22], iconAnchor: [13, 15] }), keyboard: false, riseOnHover: false });
    m.on('click', function (e) { L.DomEvent.stop(e); tippe(id, ll(b.p)); });
    gipfelMarker.push({ m: m, ab: gipfelAb(b, i) });
  });
  var reliefSchicht = null;
  var reliefFehlerGezeigt = false;
  if (NS.Relief) {
    reliefSchicht = new NS.Relief.Schicht({
      pane: 'reliefPane', bounds: grenzen.pad(1.0),
      beiFehler: function () {
        if (reliefFehlerGezeigt) return; reliefFehlerGezeigt = true;
        toast('Die Höhenkarte konnte nicht geladen werden. Ist das Internet an?', 7000);
      }
    });
  }

  // ------------------------------------------------------------ Schalter
  var gruppen = { kreis: gruppeKreis, gemeinden: gruppeGemeinden, staedte: gruppeStaedte, doerfer: gruppeDoerfer, wasser: gruppeWasser,
                  berge: gruppeGipfel, autobahn: gruppeAutobahn, bundesstr: gruppeBundesstr, umrisse: gruppeUmrisse, landstr: gruppeLandstr };

  function zoomSichtbarkeit() {
    var z = map.getZoom();
    // Weiler erst bei starkem Zoom
    var weitereSoll = an.landstr && z >= 11.5;
    if (weitereSoll && !map.hasLayer(gruppeWeitere)) gruppeWeitere.addTo(map);
    if (!weitereSoll && map.hasLayer(gruppeWeitere)) map.removeLayer(gruppeWeitere);
    var weilerSoll = an.doerfer && z >= 12;
    if (weilerSoll && !map.hasLayer(gruppeWeiler)) gruppeWeiler.addTo(map);
    if (!weilerSoll && map.hasLayer(gruppeWeiler)) map.removeLayer(gruppeWeiler);
    gipfelMarker.forEach(function (g) {
      var soll = an.berge && z >= g.ab;
      var drin = gruppeGipfel.hasLayer(g.m);
      if (soll && !drin) { gruppeGipfel.addLayer(g.m); var el0 = g.m.getElement(); if (el0) el0.style.visibility = ''; } else if (!soll && drin) gruppeGipfel.removeLayer(g.m);
    });
  }

  function stile() {
    var sk = skala();
    landLinien.forEach(function (x) { x.rand.setStyle({ weight: x.st.wr * sk }); x.kern.setStyle({ weight: x.st.wk * sk }); });
    nachbarSchicht.setStyle(nachbarStil);
    kreisFlaeche.setStyle(kreisFlaechenStil);
    gemeindeSchicht.setStyle(gemeindeStil);
    umrissSchicht.setStyle(umrissStil);
    wasserLinien.forEach(function (x) { x.linie.setStyle({ weight: WASSER_STIL[x.w.k].b * sk }); });
    strassenLinien.forEach(function (x) {
      var a = x.s.k === 'A';
      x.rand.setStyle({ weight: (a ? 10.5 : 8.5) * sk });
      x.kern.setStyle({ weight: (a ? 6.5 : 5) * sk });
    });
  }

  function aktualisiereAlles() {
    zoomSichtbarkeit();
    stile();
    if (beschriftung) beschriftung.aktualisiere();
    baueLegende();
  }

  function schalte(id, wert, still) {
    var e = EBENEN.filter(function (x) { return x.id === id; })[0];
    if (!e || !e.daten) return;
    an[id] = !!wert;
    var g = gruppen[id];
    if (g) { if (wert && !map.hasLayer(g)) g.addTo(map); if (!wert && map.hasLayer(g)) map.removeLayer(g); }
    if (id === 'berge' && reliefSchicht) {
      if (wert && !map.hasLayer(reliefSchicht)) reliefSchicht.addTo(map);
      if (!wert && map.hasLayer(reliefSchicht)) map.removeLayer(reliefSchicht);
    }
    if (id === 'doerfer') { /* Weiler folgen über zoomSichtbarkeit */ }
    var knopf = document.querySelector('.ebene[data-id="' + id + '"]');
    if (knopf) knopf.setAttribute('aria-pressed', wert ? 'true' : 'false');
    if (!still) aktualisiereAlles();
  }
  function setzeZustand(z, still) {
    EBENEN.forEach(function (e) { schalte(e.id, !!z[e.id], true); });
    if (!still) aktualisiereAlles();
  }
  function holeZustand() { var c = {}; EBENEN.forEach(function (e) { c[e.id] = !!an[e.id]; }); return c; }

  // ------------------------------------------------------------ Seitenleiste bauen
  function baueSeitenleiste() {
    var liste = $('ebenenliste'), gruppe = null;
    EBENEN.forEach(function (e) {
      if (e.gruppe !== gruppe) { gruppe = e.gruppe; var h = document.createElement('div'); h.className = 'gruppentitel'; h.textContent = gruppe; liste.appendChild(h); }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ebene' + (e.breit ? ' breit' : ''); b.setAttribute('data-id', e.id);
      b.setAttribute('aria-pressed', an[e.id] ? 'true' : 'false');
      b.style.setProperty('--ebene-farbe', e.farbe); b.style.setProperty('--ebene-hell', e.hell); if (e.text) b.style.setProperty('--ebene-text', e.text);
      if (!e.daten) { b.disabled = true; b.title = 'Dafür fehlen noch Daten'; }
      b.innerHTML = '<span class="bild' + (e.schild ? ' schildbild' + (e.breit ? ' langschild' : '') : '') + '" aria-hidden="true">' + (e.schild || SYM.svg(e.sym, 24)) + '</span>' +
        '<span class="titel">' + esc(e.titel) + (!e.daten ? '<small>(Daten fehlen)</small>' : '') + '</span>' +
        '<span class="haken" aria-hidden="true">' + SYM.svg('haken', 12) + '</span>';
      b.addEventListener('click', function () { schalte(e.id, !an[e.id]); });
      liste.appendChild(b);
    });
    var schnell = [
      ['Nur Umriss', { kreis: 1 }], ['Gemeinden', { kreis: 1, gemeinden: 1 }], ['Orte', { kreis: 1, staedte: 1, doerfer: 1, umrisse: 1 }],
      ['Straßen', { kreis: 1, staedte: 1, autobahn: 1, bundesstr: 1, landstr: 1 }], ['Wasser', { kreis: 1, wasser: 1, staedte: 1 }],
      ['Berge', { kreis: 1, berge: 1, staedte: 1 }],
      ['Alles', { kreis: 1, gemeinden: 1, staedte: 1, doerfer: 1, umrisse: 1, wasser: 1, berge: 1, autobahn: 1, bundesstr: 1, landstr: 1 }], ['Alles aus', {}]
    ];
    schnell.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = s[0];
      b.addEventListener('click', function () {
        var z = {}; EBENEN.forEach(function (e) { z[e.id] = !!s[1][e.id] && e.daten; });
        setzeZustand(z);
        if (quiz && quiz.aktiv()) quiz.beenden(true);
        schliesseMenue();
      });
      $('schnellwahl').appendChild(b);
    });
    $('quelle-grenzen').textContent = 'Grenzen: © GeoBasis-DE / BKG (Datenlizenz Deutschland – Namensnennung 2.0).';
    $('quelle-osm').textContent = O ? 'Orte, Straßen, Gewässer, Berge: © OpenStreetMap-Mitwirkende (ODbL), Stand ' + (O.stand || '?') + '.' : '';
  }

  // ------------------------------------------------------------ Legende
  function svg(w, h, inhalt) { return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + inhalt + '</svg>'; }
  function zeile(zeichen, text) { return '<div class="leg-zeile"><span class="zeichen">' + zeichen + '</span><span>' + text + '</span></div>'; }
  // Die Legende ist eine Liste: {g: Gruppentitel} | {z: Zeichen (SVG- oder Schild-HTML), t: Text} | {band: Farbe, t: Text}
  // Daraus entstehen die Legende am Bildschirm und die Legende im gespeicherten Bild.
  function legendenEintraege() {
    var L_ = [];
    function gruppe(n) { L_.push({ g: n }); }
    function eintrag(z, t) { L_.push({ z: z, t: t }); }
    if (an.kreis) {
      gruppe('Grenzen');
      eintrag(svg(50, 14, '<line x1="3" y1="7" x2="47" y2="7" stroke="#d9480f" stroke-width="5" stroke-linecap="round"/>'), 'Grenze des Landkreises');
      eintrag(svg(44, 22, '<rect x="2" y="2" width="40" height="18" rx="5" fill="#e4e7ea" stroke="#868e96" stroke-width="2"/>'), 'Nachbarkreise (grau)');
    }
    if (an.gemeinden) {
      if (!an.kreis) gruppe('Grenzen');
      eintrag(svg(50, 14, '<line x1="3" y1="7" x2="47" y2="7" stroke="#862e9c" stroke-width="3" stroke-dasharray="9 6" stroke-linecap="round"/>'), 'Grenze einer Gemeinde');
    }
    if (an.staedte || an.doerfer || an.umrisse) gruppe('Orte');
    if (an.staedte) {
      eintrag(svg(26, 26, '<circle cx="13" cy="13" r="10" fill="#e03131" stroke="#fff" stroke-width="3"/>'), 'Stadt');
      eintrag(svg(26, 26, '<circle cx="13" cy="13" r="8" fill="#868e96" stroke="#fff" stroke-width="3"/>'), 'Stadt außerhalb');
    }
    if (an.doerfer) eintrag(svg(26, 26, '<circle cx="13" cy="13" r="7" fill="#f08c00" stroke="#fff" stroke-width="3"/>'), 'Dorf');
    if (an.umrisse) {
      eintrag(svg(44, 26, '<path d="M4 9C4 4 14 2 24 4s17 3 16 9-8 11-18 10S3 20 4 9z" fill="#ff8787" fill-opacity=".62" stroke="#c92a2a" stroke-width="2.2"/>'), 'Fläche einer Stadt');
      eintrag(svg(44, 26, '<path d="M8 10c1-5 9-7 17-6s13 4 11 10-9 9-17 8S7 16 8 10z" fill="#ffc078" fill-opacity=".62" stroke="#e8590c" stroke-width="2.2"/>'), 'Fläche eines Dorfes');
    }
    if (an.wasser) {
      gruppe('Wasser');
      eintrag(svg(50, 16, '<path d="M3 9 Q 12 1 21 9 T 39 9 T 48 8" fill="none" stroke="#2b8ae0" stroke-width="4" stroke-linecap="round"/>'), 'Fluss oder Bach');
      eintrag(svg(44, 24, '<ellipse cx="22" cy="12" rx="19" ry="9" fill="#74c0fc" stroke="#1c7ed6" stroke-width="2"/>'), 'See oder Talsperre');
    }
    if (an.autobahn || an.bundesstr || an.landstr) gruppe('Straßen');
    if (an.autobahn) eintrag('<span class="schild autobahn">' + esc(ersteA) + '</span>', 'Autobahn');
    if (an.bundesstr) eintrag('<span class="schild bundesstr">' + esc(ersteB) + '</span>', 'Bundesstraße');
    if (an.landstr) {
      eintrag('<span class="schild landstr">' + esc(ersteL) + '</span>', 'Landesstraße');
      var ersteK = (LANDSTR.filter(function (s) { return s.k === 'K'; })[0] || { r: 'K 4' }).r;
      eintrag('<span class="schild kreisstr">' + esc(ersteK) + '</span>', 'Kreisstraße');
    }
    if (an.berge) {
      gruppe('Berge und Täler');
      if (BERGE.length) eintrag(svg(24, 22, '<path d="M12 2 L22 20 L2 20 Z" fill="#7f3f12" stroke="#fff" stroke-width="2"/>'), 'Berggipfel mit Höhe');
      if (NS.Relief) NS.Relief.stufen.slice().reverse().forEach(function (st) { L_.push({ band: st.farbe, t: st.text }); });
    }
    return L_;
  }
  function baueLegende() {
    var h = '', baender = '';
    function bandEnde() { if (baender) { h += '<div class="leg-hoehen">' + baender + '</div>'; baender = ''; } }
    legendenEintraege().forEach(function (e) {
      if (e.band) { baender += '<div class="band"><i style="background:' + e.band + '"></i><span>' + esc(e.t) + '</span></div>'; return; }
      bandEnde();
      if (e.g) h += '<div class="leg-gruppe">' + esc(e.g) + '</div>'; else h += zeile(e.z, e.t);
    });
    bandEnde();
    if (!h) h = '<p class="leg-leer">Schalte links etwas ein, dann erkläre ich es dir hier.</p>';
    $('legendeninhalt').innerHTML = h;
  }

  // ------------------------------------------------------------ Beschriftungen
  function sichtRechteck(inset) {
    var tl = map.containerPointToLayerPoint([0, 0]), s = map.getSize();
    return { x: tl.x + inset, y: tl.y + inset, w: s.x - 2 * inset, h: s.y - 2 * inset };
  }
  function ringe(f) {
    if (f._ringe) return f._ringe;
    var g = f.geometry;
    var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    f._ringe = polys.map(function (p) { return p[0].map(ll); });
    return f._ringe;
  }
  function klemme(pts, r) {                 // Polygon an Rechteck abschneiden (Sutherland-Hodgman)
    var kanten = [
      { in: function (p) { return p.x >= r.x; }, ps: function (a, b) { var t = (r.x - a.x) / (b.x - a.x); return { x: r.x, y: a.y + t * (b.y - a.y) }; } },
      { in: function (p) { return p.x <= r.x + r.w; }, ps: function (a, b) { var t = (r.x + r.w - a.x) / (b.x - a.x); return { x: r.x + r.w, y: a.y + t * (b.y - a.y) }; } },
      { in: function (p) { return p.y >= r.y; }, ps: function (a, b) { var t = (r.y - a.y) / (b.y - a.y); return { x: a.x + t * (b.x - a.x), y: r.y }; } },
      { in: function (p) { return p.y <= r.y + r.h; }, ps: function (a, b) { var t = (r.y + r.h - a.y) / (b.y - a.y); return { x: a.x + t * (b.x - a.x), y: r.y + r.h }; } }
    ];
    var aus = pts;
    for (var k = 0; k < kanten.length && aus.length; k++) {
      var ein = aus; aus = [];
      for (var i = 0; i < ein.length; i++) {
        var a = ein[i], b = ein[(i + 1) % ein.length], ia = kanten[k].in(a), ib = kanten[k].in(b);
        if (ia) aus.push(a);
        if (ia !== ib) aus.push(kanten[k].ps(a, b));
      }
    }
    return aus;
  }
  function flaecheVon(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
  function imPolygon(pt, p) {
    var drin = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if (((p[i].y > pt.y) !== (p[j].y > pt.y)) && (pt.x < (p[j].x - p[i].x) * (pt.y - p[i].y) / (p[j].y - p[i].y) + p[i].x)) drin = !drin;
    }
    return drin;
  }
  function sichtMitte(ringeLL, rect) {      // Mitte des gerade sichtbaren Teils einer Fläche
    var best = null;
    ringeLL.forEach(function (r) {
      var pts = r.map(function (q) { return map.latLngToLayerPoint(q); });
      var cl = klemme(pts, rect);
      if (cl.length < 3) return;
      var A = flaecheVon(cl);
      if (Math.abs(A) < 300) return;
      var cx = 0, cy = 0;
      for (var i = 0; i < cl.length; i++) {
        var a = cl[i], b = cl[(i + 1) % cl.length], f = a.x * b.y - b.x * a.y;
        cx += (a.x + b.x) * f; cy += (a.y + b.y) * f;
      }
      var c = { x: cx / (6 * A), y: cy / (6 * A) };
      if (!imPolygon(c, cl)) {              // Schwerpunkt liegt daneben: breiteste waagrechte Sehne nehmen
        var xs = [];
        for (var k = 0; k < cl.length; k++) {
          var p1 = cl[k], p2 = cl[(k + 1) % cl.length];
          if ((p1.y > c.y) !== (p2.y > c.y)) xs.push(p1.x + (c.y - p1.y) / (p2.y - p1.y) * (p2.x - p1.x));
        }
        xs.sort(function (u, v) { return u - v; });
        var bestW = -1, bx = null;
        for (var m = 0; m + 1 < xs.length; m += 2) if (xs[m + 1] - xs[m] > bestW) { bestW = xs[m + 1] - xs[m]; bx = (xs[m] + xs[m + 1]) / 2; }
        if (bx === null) return;
        c = { x: bx, y: c.y };
      }
      if (!best || Math.abs(A) > best.a) best = { p: c, a: Math.abs(A) };
    });
    return best;
  }

  var kreisRingen = ringe(G.kreis);
  var nachbarListe = G.nachbarn.features.map(function (f) { return { f: f, ringe: ringe(f) }; });
  var gemeindeListe = gemFeat.map(function (f) { return { f: f, ringe: ringe(f), id: 'gemeinde:' + f.properties.id }; });
  var ortNachName = {};
  ORTE.forEach(function (o) { if (o.t === 'stadt' || o.t === 'dorf') ortNachName[o.n] = o; });

  function holeEtiketten(ctx) {
    var z = ctx.zoom, out = [], verb = (quiz && quiz.verborgen()) || {};
    var rect = sichtRechteck(36);

    if (an.kreis) {
      if (!verb.kreis && z <= 11 && !(an.gemeinden && !verb.gemeinde)) {
        var km_ = sichtMitte(kreisRingen, rect);
        if (km_) out.push({ schluessel: 'kreisname', text: 'LANDKREIS GOTHA', klasse: 'kreisname', art: 'mitte', pPixel: km_.p, prio: 3, groesse: z <= 10 ? 21 : 19, abstand: 3, fett: '900',
                            versatz: [[0, 0], [0, -40], [0, 40], [0, -80], [0, 80], [0, -120], [0, 120], [-110, 0], [110, 0], [-110, -50], [110, 50], [-110, 50], [110, -50]] });
      }
      nachbarListe.forEach(function (n) {
        var nn = n.f.properties.n;
        if (an.staedte && !verb.nachbarstadt && /^Stadt /.test(nn) && ortNachName[nn.slice(6)] === undefined && ORTE.some(function (o) { return o.t === 'nachbarstadt' && o.n === nn.slice(6); })) return;   // "Stadt Erfurt" nicht doppelt zur Stadtbeschriftung
        var m = sichtMitte(n.ringe, rect);
        if (m && m.a > 700) out.push({ schluessel: 'nb' + n.f.properties.id, text: n.f.properties.n, klasse: 'nachbar', art: 'mitte', pPixel: m.p, prio: 95, groesse: 15, abstand: 1, fett: '800', versatz: [[0, 0], [0, -34], [0, 34], [-70, 0], [70, 0], [0, -70], [0, 70]] });
      });
    }
    if (an.gemeinden && !verb.gemeinde) {
      gemeindeListe.forEach(function (g) {
        var m = sichtMitte(g.ringe, rect);
        if (!m || m.a < 500) return;
        var name = g.f.properties.n, ersatz = null, o = ortNachName[name];
        if (o && ((o.t === 'stadt' && an.staedte) || (o.t === 'dorf' && an.doerfer))) ersatz = o.id;
        out.push({ schluessel: g.id, text: name, klasse: 'gemeinde', art: 'mitte', pPixel: m.p, prio: 55 + Math.min(9, Math.sqrt(m.a) / 40), groesse: z >= 12 ? 17 : 15, fett: '800', ersatzFuer: ersatz });
      });
    }
    ORTE.forEach(function (o) {
      var t = o.t, aktiv, prio, gr, klasse = t;
      if (t === 'stadt') { aktiv = an.staedte && !verb.stadt; prio = 95; gr = z >= 11 ? 19 : 17; }
      else if (t === 'nachbarstadt') { aktiv = an.staedte && !verb.nachbarstadt && z <= 12; prio = 70; gr = 14; }
      else if (t === 'dorf') { aktiv = an.doerfer && !verb.dorf && z >= 10; prio = 40 + Math.min(14, (o.e || 0) / 400); gr = z >= 12 ? 16 : 14; }
      else { aktiv = an.doerfer && !verb.dorf && z >= 12; prio = 20; gr = 13; }
      if (!aktiv) return;
      var s = STIL[t] || STIL.dorf;
      out.push({ schluessel: o.id, text: o.n, klasse: klasse, art: 'punkt', punkt: o.ll, radius: s.r + (s.rand / 2), prio: prio, notfall: t === 'stadt', groesse: gr, fett: t === 'stadt' ? '900' : '800' });
    });
    if (an.berge && verb.berg) {
      // Quiz „Berge“: Gipfel bleiben als Markierungen sichtbar, nur die Namen fehlen
      gipfelMarker.forEach(function (g) { var el = g.m.getElement(); if (el) el.style.visibility = ''; });
    }
    if (an.berge && !verb.berg) {
      BERGE.forEach(function (b, i) {
        if (z < gipfelAb(b, i)) return;
        out.push({ schluessel: 'berg:' + i, text: b.n + ' ' + b.h + ' m', html: esc(b.n) + ' <b>' + b.h + ' m</b>', klasse: 'berg', art: 'punkt', punkt: ll(b.p), radius: 9, markierungEl: gipfelMarker[i].m.getElement.bind(gipfelMarker[i].m), prio: 97 - i * 0.1, groesse: 14, fett: '800' });   // die acht Berge sind alle wichtig: sie bekommen ihren Platz zuerst
      });
    }
    if (an.wasser && !verb.wasser) {
      WASSER.forEach(function (w) {
        if (w.k === 'bach' && z < 11) return;
        if (z < 9) return;
        out.push({ schluessel: 'w:' + w.n, text: w.n, klasse: 'wasser', art: 'linie', linien: w._ll, prio: w.k === 'bach' ? 44 : 66, groesse: 15, fett: '800', maxAnzahl: z >= 12 ? 3 : 1 });
      });
      SEEN.forEach(function (s, i) {
        if (z < (s.ha > 20 ? 9 : 11)) return;
        out.push({ schluessel: 'see:' + i, text: s.n, klasse: 'wasser', art: 'mitte', punkt: ll(s.a), prio: 62, groesse: 15, fett: '800' });
      });
    }
    if (an.autobahn || an.bundesstr) {
      STRASSEN.forEach(function (s) {
        if ((s.k === 'A' && !an.autobahn) || (s.k === 'B' && !an.bundesstr) || verb.strasse) return;
        out.push({ schluessel: 's:' + s.r, text: s.r, klasse: 'schild ' + (s.k === 'A' ? 'autobahn' : 'bundesstr'), art: 'schild', linien: s._ll, prio: s.k === 'A' ? 52 : 50, groesse: 13, fett: '900', maxAnzahl: 3, abstandPx: 340 });
      });
    }
    if (an.landstr && !verb.strasse) {
      LANDSTR.forEach(function (s) {
        var land = s.k === 'L';
        if (z < (land ? 11 : 11.5)) return;
        out.push({ schluessel: 's:' + s.r, text: s.r, klasse: 'schild ' + (land ? 'landstr' : 'kreisstr'), art: 'schild', linien: s._ll, prio: land ? 48 : 46, groesse: land ? 13 : 12, fett: '900', maxAnzahl: 2, abstandPx: 300 });
      });
    }
    return out;
  }
  var beschriftung = new NS.Beschriftung(map, { holeEtiketten: holeEtiketten });
  // Etiketten neu messen, sobald die Schriften geladen sind (sonst stimmen die Breiten nicht)
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('800 15px Nunito'), document.fonts.load('900 15px Nunito'), document.fonts.load('600 20px Fredoka')])
      .then(function () { beschriftung.cache = {}; beschriftung.aktualisiere(); }, function () { /* Ersatzschrift bleibt */ });
  }

  // ------------------------------------------------------------ Hervorheben (Quiz / Suche)
  var hervorGruppe = L.layerGroup().addTo(map), hervorTimer = null;
  function entferneHervor() { hervorGruppe.clearLayers(); if (hervorTimer) { clearTimeout(hervorTimer); hervorTimer = null; } }
  function hebeHervor(id, dauer) {
    entferneHervor();
    var z = ZIELE[id]; if (!z) return;
    if (z.typ === 'punkt') {
      hervorGruppe.addLayer(L.marker(z.ll, { icon: L.divIcon({ className: '', html: '<div class="puls"></div>', iconSize: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: 900 }));
    } else if (z.typ === 'flaeche') {
      hervorGruppe.addLayer(L.geoJSON(z.feature, { pane: 'hervorPane', interactive: false, style: { color: '#2f9e44', weight: 6, fillColor: '#69db7c', fillOpacity: 0.5 } }));
    } else if (z.typ === 'linie') {
      hervorGruppe.addLayer(L.polyline(z.c, { pane: 'hervorPane', interactive: false, color: '#2f9e44', weight: 11, opacity: 0.85, lineCap: 'round' }));
    }
    if (dauer !== 0) hervorTimer = setTimeout(entferneHervor, dauer || 5000);
  }
  function boundsVon(id) {
    var z = ZIELE[id];
    if (z.typ === 'flaeche') return L.geoJSON(z.feature).getBounds();
    if (z.typ === 'linie') return L.polyline(z.c).getBounds();
    return null;
  }
  function zeigeZiel(id) {
    var z = ZIELE[id]; if (!z) return;
    var b = boundsVon(id);
    if (b) map.flyToBounds(b, { padding: [60, 60], maxZoom: 13, duration: 0.8 });
    else map.flyTo(z.ll, Math.max(map.getZoom(), 12), { duration: 0.8 });
    hebeHervor(id, 6000);
    if (z.typ === 'punkt') setTimeout(function () { tippe(id, z.ll); }, 900);
  }

  // ------------------------------------------------------------ Suche
  var suchIndex = [];
  (function () {
    function add(id, text, artText, ebene) { suchIndex.push({ id: id, text: text, norm: norm(text), art: artText, ebene: ebene }); }
    gemFeat.forEach(function (f) {
      var n = f.properties.n, o = ortNachName[n];
      if (o) return;                              // gleichnamige Stadt/Dorf wird als Ort gefunden
      add('gemeinde:' + f.properties.id, n, f.properties.art, 'gemeinden');
    });
    ORTE.forEach(function (o) {
      add(o.id, o.n, o.t === 'stadt' ? 'Stadt' : o.t === 'nachbarstadt' ? 'Stadt außerhalb' : o.t === 'weiler' ? 'Kleiner Ort' : 'Dorf', o.t === 'stadt' || o.t === 'nachbarstadt' ? 'staedte' : 'doerfer');
    });
    BERGE.forEach(function (b, i) { add('berg:' + i, b.n, 'Berg · ' + b.h + ' m', 'berge'); });
    WASSER.forEach(function (w) { add('wasser:' + w.n, w.n, w.k === 'bach' ? 'Bach' : w.k === 'kanal' ? 'Kanal' : 'Fluss', 'wasser'); });
    SEEN.forEach(function (s, i) { add('see:' + i, s.n, s.k === 'talsperre' ? 'Talsperre' : s.k === 'stausee' ? 'Stausee' : s.k === 'teich' ? 'Teich' : 'See', 'wasser'); });
    STRASSEN.forEach(function (s) { add('strasse:' + s.r, s.r, s.k === 'A' ? 'Autobahn' : 'Bundesstraße', s.k === 'A' ? 'autobahn' : 'bundesstr'); });
    LANDSTR.forEach(function (s) { add('strasse:' + s.r, s.r, s.k === 'L' ? 'Landesstraße' : 'Kreisstraße', 'landstr'); });
    G.nachbarn.features.forEach(function (f) { add('nachbar:' + f.properties.id, f.properties.n, 'Nachbarkreis', 'kreis'); });
    add('kreis', 'Landkreis Gotha', 'Landkreis', 'kreis');
  })();

  var treffer = [], auswahl = -1;
  function sucheAus(q) {
    var n = norm(q).trim();
    if (!n) return [];
    var e = [];
    suchIndex.forEach(function (x) {
      var pos = x.norm.indexOf(n);
      if (pos < 0) return;
      e.push({ x: x, rang: (pos === 0 ? 0 : x.norm.split(' ').some(function (w) { return w.indexOf(n) === 0; }) ? 1 : 2) * 100 + x.text.length });
    });
    e.sort(function (a, b) { return a.rang - b.rang; });
    return e.slice(0, 8).map(function (a) { return a.x; });
  }
  function zeigeTreffer() {
    var ul = $('suchtreffer'), q = $('suchfeld').value;
    treffer = sucheAus(q); auswahl = -1;
    ul.innerHTML = '';
    if (!q.trim()) { ul.hidden = true; return; }
    if (!treffer.length) { ul.innerHTML = '<li class="leer">Nichts gefunden. Prüfe die Schreibweise.</li>'; ul.hidden = false; return; }
    treffer.forEach(function (t, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false');
      var st = artStil(t.art);
      li.innerHTML = '<span class="ts" aria-hidden="true" style="background:' + st[2] + ';color:' + st[1] + '">' + SYM.svg(st[0], 20) + '</span><span>' + esc(t.text) + '</span><small>' + esc(t.art) + '</small>';
      li.addEventListener('mousedown', function (ev) { ev.preventDefault(); waehle(t); });
      li.addEventListener('touchend', function (ev) { ev.preventDefault(); waehle(t); });
      ul.appendChild(li);
    });
    ul.hidden = false;
  }
  function waehle(t) {
    $('suchtreffer').hidden = true;
    $('suchfeld').value = t.text;
    if (quiz && quiz.aktiv()) quiz.beenden(true);
    if (t.ebene && !an[t.ebene]) {
      var e = EBENEN.filter(function (x) { return x.id === t.ebene; })[0];
      if (e && e.daten) { schalte(t.ebene, true); toast('Ich habe „' + e.titel + '“ für dich eingeschaltet.', 3000); }
    }
    schliesseMenue();
    $('suchfeld').blur();
    zeigeZiel(t.id);
  }
  $('suchfeld').addEventListener('input', zeigeTreffer);
  $('suchfeld').addEventListener('focus', function () { if ($('suchfeld').value.trim()) zeigeTreffer(); });
  $('suchfeld').addEventListener('blur', function () { setTimeout(function () { $('suchtreffer').hidden = true; }, 150); });
  $('suchfeld').addEventListener('keydown', function (ev) {
    var lis = $('suchtreffer').querySelectorAll('li:not(.leer)');
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!lis.length) return; ev.preventDefault();
      auswahl = (auswahl + (ev.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
      lis.forEach(function (li, i) { li.setAttribute('aria-selected', i === auswahl ? 'true' : 'false'); });
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      var t = treffer[auswahl >= 0 ? auswahl : 0]; if (t) waehle(t);
    } else if (ev.key === 'Escape') { $('suchtreffer').hidden = true; }
  });

  // ------------------------------------------------------------ Kleinkram: Toast, Menü, Heim
  var toastTimer = null;
  function toast(text, ms) {
    var t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }
  function schliesseMenue() { document.body.classList.remove('menue-offen'); $('menueknopf').setAttribute('aria-expanded', 'false'); setTimeout(function () { map.invalidateSize(); }, 250); }
  $('menueknopf').addEventListener('click', function () {
    var offen = document.body.classList.toggle('menue-offen');
    $('menueknopf').setAttribute('aria-expanded', offen ? 'true' : 'false');
  });
  function zeigeGanz() {      // ganzen Landkreis zeigen (unter der Quizleiste, falls sie offen ist)
    var q = $('quizleiste'), oben = q.hidden ? 0 : q.offsetHeight + 14;
    map.flyToBounds(grenzen.pad(0.1), { duration: 0.7, paddingTopLeft: [0, oben] });
  }
  // ------------------------------------------------------------ Karte als Bild speichern
  var bildMenue = $('bildmenue'), bildKnopf = $('bildknopf');
  function bildMenueZu() { bildMenue.hidden = true; bildKnopf.setAttribute('aria-expanded', 'false'); }
  bildKnopf.addEventListener('click', function () {
    var auf = bildMenue.hidden;
    bildMenue.hidden = !auf; bildKnopf.setAttribute('aria-expanded', auf ? 'true' : 'false');
    if (auf) { var b1 = bildMenue.querySelector('button'); if (b1) b1.focus(); }
  });
  document.addEventListener('click', function (e) { if (!bildMenue.hidden && !$('bildbox').contains(e.target)) bildMenueZu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !bildMenue.hidden) { bildMenueZu(); bildKnopf.focus(); } });
  bildMenue.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-legende]') : null;
    if (!b) return;
    bildMenueZu();
    bildSpeichern(b.getAttribute('data-legende') === '1');
  });
  function bildSpeichern(mitLegende, ohneDownload) {
    if (!NS.Export) { toast('Das Speichern als Bild geht hier leider nicht.', 5000); return Promise.resolve(null); }
    toast('Das Bild wird gemacht …', 8000);
    return NS.Export.speichern({
      karte: map, behaelter: $('karte'), relief: an.berge ? reliefSchicht : null, mitLegende: mitLegende, eintraege: legendenEintraege(), titel: 'Landkreis Gotha',
      quellen: 'Karte: © OpenStreetMap-Mitwirkende · © GeoBasis-DE / BKG' + (an.berge ? ' · Höhen: Terrain Tiles (u. a. NASA SRTM)' : ''),
      herunterladen: !ohneDownload
    }).then(function (r) { toast('Gespeichert: ' + r.name + ' (im Ordner „Downloads“)', 6000); return r; })
      .catch(function () { toast('Das Bild konnte nicht gespeichert werden.', 6000); return null; });
  }

  $('heimknopf').addEventListener('click', function () { map.closePopup(); entferneHervor(); zeigeGanz(); });
  map.on('click', function () { if (window.matchMedia('(max-width: 920px)').matches) schliesseMenue(); });
  $('legendenknopf').addEventListener('click', function () { var l = $('legende'); l.hidden = !l.hidden; baueLegende(); schliesseMenue(); });
  document.querySelectorAll('[data-schliessen]').forEach(function (b) { b.addEventListener('click', function () { $(b.getAttribute('data-schliessen')).hidden = true; }); });
  window.addEventListener('resize', function () { map.invalidateSize(); });

  map.on('zoomend', function () { zoomSichtbarkeit(); stile(); });
  map.on('moveend', function () { /* Beschriftung hört selbst zu */ });

  // ------------------------------------------------------------ Quiz anbinden
  function richtungVonMitte(p) {
    var dx = (p.lng - kreisMitte.lng) * Math.cos(kreisMitte.lat * Math.PI / 180), dy = p.lat - kreisMitte.lat;
    var w = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    return ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'][Math.floor(((w + 22.5) % 360) / 45)];
  }
  function kategorien() {
    var K = [];
    var staedteZ = ORTE.filter(function (o) { return o.t === 'stadt'; });
    if (staedteZ.length >= 3) K.push({ id: 'stadt', titel: 'Städte', sym: 'stadt', farbe: '#c92a2a', hell: '#ffe3e3', frage: 'die Stadt', suche: 'die Stadt', ebenen: ['kreis', 'staedte'], verberge: ['stadt'], ziele: staedteZ.map(function (o) { return { id: o.id, name: o.n }; }) });
    K.push({ id: 'gemeinde', titel: 'Gemeinden', sym: 'gemeinden', farbe: '#862e9c', hell: '#f3d9fa', frage: 'die Gemeinde', suche: 'die Gemeinde', ebenen: ['kreis', 'gemeinden'], verberge: ['gemeinde'],
             ziele: gemFeat.map(function (f) { return { id: 'gemeinde:' + f.properties.id, name: f.properties.n }; }) });
    var dorfZ = ORTE.filter(function (o) { return o.t === 'dorf'; });
    if (dorfZ.length >= 8) K.push({ id: 'dorf', titel: 'Dörfer', sym: 'dorf', farbe: '#8a4b00', hell: '#fff0d0', frage: 'das Dorf', suche: 'das Dorf', ebenen: ['kreis', 'gemeinden', 'doerfer'], verberge: ['dorf', 'gemeinde'], ziele: dorfZ.map(function (o) { return { id: o.id, name: o.n }; }) });
    var bergZ = BERGE.map(function (b, i) { return { id: 'berg:' + i, name: b.n, h: b.h }; });
    if (bergZ.length >= 5) K.push({ id: 'berg', titel: 'Berge', sym: 'berg', farbe: '#8c5a2b', hell: '#f0dcc3', frage: 'der Berg', suche: 'den Berg', ebenen: ['kreis', 'berge'], verberge: ['berg'], ziele: bergZ });
    var flussZ = WASSER.filter(function (w) { return w.k === 'fluss' && w.km >= 5; }).slice(0, 8).map(function (w) { return { id: 'wasser:' + w.n, name: w.n }; });
    if (flussZ.length >= 4) K.push({ id: 'fluss', titel: 'Flüsse', sym: 'wasser', farbe: '#1c6fc2', hell: '#d0ebff', frage: 'der Fluss', suche: 'den Fluss', ebenen: ['kreis', 'wasser'], verberge: ['wasser'], ziele: flussZ });
    return K;
  }
  if (NS.Quiz) {
    quiz = new NS.Quiz({
      karte: map, kategorien: kategorien, holeZustand: holeZustand, setzeZustand: setzeZustand, ziel: function (id) { return ZIELE[id]; },
      hebeHervor: hebeHervor, entferneHervor: entferneHervor, richtung: richtungVonMitte, aktualisiere: function () { if (beschriftung) beschriftung.aktualisiere(); },
      schliesseMenue: schliesseMenue, zeigeGanz: zeigeGanz, toast: toast, schliessePopup: function () { map.closePopup(); }
    });
    NS.quiz = quiz;
  }
  $('quizknopf').addEventListener('click', function () { if (quiz) { quiz.start(); schliesseMenue(); } });

  // ------------------------------------------------------------ Start
  baueSeitenleiste();
  EBENEN.forEach(function (e) { if (an[e.id]) { var g = gruppen[e.id]; if (g) g.addTo(map); if (e.id === 'berge' && reliefSchicht) reliefSchicht.addTo(map); } });
  map.fitBounds(grenzen.pad(0.1), { animate: false });
  zoomSichtbarkeit(); stile(); baueLegende();
  map.whenReady(function () { setTimeout(function () { map.invalidateSize(); map.fitBounds(grenzen.pad(0.1), { animate: false }); beschriftung.aktualisiere(); }, 60); });

  var gesehen = false;
  try { gesehen = localStorage.getItem('gotha-karte-willkommen') === '1'; } catch (e) { /* egal */ }
  if (!gesehen) $('willkommen').hidden = false;
  $('losgehts').addEventListener('click', function () {
    $('willkommen').hidden = true;
    try { localStorage.setItem('gotha-karte-willkommen', '1'); } catch (e) { /* egal */ }
  });

  // für Tests und Fehlersuche
  NS.app = { karte: map, an: an, schalte: schalte, setzeZustand: setzeZustand, ZIELE: ZIELE, tippe: tippe, zeigeZiel: zeigeZiel, bildSpeichern: bildSpeichern, legendenEintraege: legendenEintraege, beschriftung: beschriftung, suche: sucheAus, ORTE: ORTE };
})();
