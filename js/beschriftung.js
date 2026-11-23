/* Beschriftungen ohne Durcheinander:
 * Alle Namen werden nach Wichtigkeit sortiert. Ein Name wird nur gezeigt, wenn er keinen
 * anderen Namen und keinen Punkt überdeckt. So bleibt die Karte für Kinder lesbar. */
(function () {
  'use strict';
  var NS = window.Gotha = window.Gotha || {};

  var PAD = 3;                  // Abstand zwischen Etiketten (Pixel)
  var RAND = 40;                // Etiketten etwas über den Rand hinaus zulassen

  function Beschriftung(map, optionen) {
    this.map = map;
    this.holeEtiketten = optionen.holeEtiketten;       // function(ctx) -> Liste
    this.pane = map.createPane('labelPane');
    this.pane.style.zIndex = 640;
    this.pane.style.pointerEvents = 'none';
    this.mess = document.createElement('canvas').getContext('2d');
    this.schrift = getComputedStyle(document.body).fontFamily;
    this.cache = {};
    this.letzte = [];
    this._geplant = false;
    var self = this;
    map.on('moveend zoomend resize', function () { self.aktualisiere(); });
    map.on('zoomstart', function () { map.getContainer().classList.add('zoomt'); });
    map.on('zoomend', function () { map.getContainer().classList.remove('zoomt'); });
  }

  Beschriftung.prototype.breite = function (text, groesse, fett, abstand) {
    var key = groesse + '|' + fett + '|' + abstand + '|' + text;
    var c = this.cache[key];
    if (c === undefined) {
      this.mess.font = fett + ' ' + groesse + 'px ' + this.schrift;
      c = this.mess.measureText(text).width + text.length * (abstand || 0) + 6;
      this.cache[key] = c;
    }
    return c;
  };

  Beschriftung.prototype.aktualisiere = function () {
    if (this._geplant) return;
    this._geplant = true;
    var self = this;
    (window.requestAnimationFrame || setTimeout)(function () { self._geplant = false; self._zeichne(); });
  };

  function schneidet(a, b) {
    return !(a.x + a.w + PAD <= b.x || b.x + b.w + PAD <= a.x || a.y + a.h + PAD <= b.y || b.y + b.h + PAD <= a.y);
  }

  // Sichtbare Teilstücke einer Linie (Liang-Barsky gegen das Rechteck)
  function sichtbareStuecke(punkte, r) {
    var runs = [], lauf = null;
    function clip(p, q) {
      var dx = q.x - p.x, dy = q.y - p.y, t0 = 0, t1 = 1;
      var ps = [-dx, dx, -dy, dy], qs = [p.x - r.x, r.x + r.w - p.x, p.y - r.y, r.y + r.h - p.y];
      for (var i = 0; i < 4; i++) {
        if (ps[i] === 0) { if (qs[i] < 0) return null; }
        else {
          var t = qs[i] / ps[i];
          if (ps[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
          else { if (t < t0) return null; if (t < t1) t1 = t; }
        }
      }
      return [{ x: p.x + t0 * dx, y: p.y + t0 * dy }, { x: p.x + t1 * dx, y: p.y + t1 * dy }, t0, t1];
    }
    for (var i = 1; i < punkte.length; i++) {
      var c = clip(punkte[i - 1], punkte[i]);
      if (!c) { lauf = null; continue; }
      if (!lauf || c[2] > 0) { lauf = [c[0]]; runs.push(lauf); }
      lauf.push(c[1]);
      if (c[3] < 1) lauf = null;
    }
    return runs.map(function (pts) {
      var cum = [0];
      for (var k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      return { pts: pts, cum: cum, laenge: cum[cum.length - 1] };
    }).filter(function (r_) { return r_.laenge > 4; });
  }

  function punktBei(run, s) {
    var cum = run.cum, pts = run.pts, i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    var t = (s - cum[i - 1]) / Math.max(0.0001, cum[i] - cum[i - 1]);
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
  }

  Beschriftung.prototype._zeichne = function () {
    var map = this.map, self = this;
    var gr = map.getSize();
    var tl = map.containerPointToLayerPoint([0, 0]);
    var sicht = { x: tl.x - RAND, y: tl.y - RAND, w: gr.x + 2 * RAND, h: gr.y + 2 * RAND };
    var ctx = { zoom: map.getZoom(), karte: map };
    var roh = this.holeEtiketten(ctx) || [];

    // Punkte vorbereiten
    var items = [];
    roh.forEach(function (it) {
      var o = {}; for (var k in it) o[k] = it[k];
      o.groesse = o.groesse || 15;
      o.fett = o.fett || '800';
      if (o.art === 'punkt' || o.art === 'mitte') {
        var p = o.pPixel || map.latLngToLayerPoint(o.punkt);
        if (p.x < sicht.x || p.x > sicht.x + sicht.w || p.y < sicht.y || p.y > sicht.y + sicht.h) return;
        o.p = p;
      }
      items.push(o);
    });

    // Hindernisse: alle sichtbaren Punkte (Markierungen) werden nie überdeckt
    var boxen = [];
    items.forEach(function (o) {
      if (o.art === 'punkt' && o.radius) {
        var r = o.radius + 1;
        boxen.push({ x: o.p.x - r, y: o.p.y - r, w: 2 * r, h: 2 * r, eigner: o, markierung: true, prio: o.prio || 0 });
      }
    });

    items.sort(function (a, b) { return (b.prio || 0) - (a.prio || 0); });
    var platziert = [], gesetzt = {};

    // Stufen der Platzsuche für wichtige Etiketten (prio >= 85):
    //   0 = nichts darf berührt werden
    //   1 = kleine, unwichtigere Markierungen (z. B. Dorfpunkte) dürfen überdeckt werden
    //   2 = Notlösung nur für Einträge mit "notfall: true" (Städte): jede Markierung darf berührt werden (aber nie ein anderes Etikett)
    function frei(box, eigner, stufe) {
      for (var i = 0; i < boxen.length; i++) {
        var bx = boxen[i];
        if (bx.eigner === eigner) continue;
        if (bx.markierung && stufe >= 2) continue;
        if (bx.markierung && stufe === 1 && bx.prio < (eigner.prio || 0)) continue;
        if (schneidet(box, bx)) return false;
      }
      return true;
    }

    items.forEach(function (o) {
      if (o.ersatzFuer && gesetzt[o.ersatzFuer]) return;
      var w = self.breite(o.text, o.groesse, o.fett, o.abstand), h = o.groesse * 1.2;
      var treffer = null;

      if (o.art === 'punkt') {
        var r = o.radius || 0, x = o.p.x, y = o.p.y;
        var cands = [
          { a: 'rechts', t: 'translate(' + (x + r + 4) + 'px,' + y + 'px) translate(0,-50%)', b: { x: x + r + 4, y: y - h / 2, w: w, h: h } },
          { a: 'links', t: 'translate(' + (x - r - 4) + 'px,' + y + 'px) translate(-100%,-50%)', b: { x: x - r - 4 - w, y: y - h / 2, w: w, h: h } },
          { a: 'oben', t: 'translate(' + x + 'px,' + (y - r - 3) + 'px) translate(-50%,-100%)', b: { x: x - w / 2, y: y - r - 3 - h, w: w, h: h } },
          { a: 'unten', t: 'translate(' + x + 'px,' + (y + r + 3) + 'px) translate(-50%,0)', b: { x: x - w / 2, y: y + r + 3, w: w, h: h } },
          // Ausweichplätze schräg neben dem Punkt
          { a: 'rechts-oben', t: 'translate(' + (x + r + 2) + 'px,' + (y - r - 2) + 'px) translate(0,-100%)', b: { x: x + r + 2, y: y - r - 2 - h, w: w, h: h } },
          { a: 'rechts-unten', t: 'translate(' + (x + r + 2) + 'px,' + (y + r + 2) + 'px)', b: { x: x + r + 2, y: y + r + 2, w: w, h: h } },
          { a: 'links-oben', t: 'translate(' + (x - r - 2) + 'px,' + (y - r - 2) + 'px) translate(-100%,-100%)', b: { x: x - r - 2 - w, y: y - r - 2 - h, w: w, h: h } },
          { a: 'links-unten', t: 'translate(' + (x - r - 2) + 'px,' + (y + r + 2) + 'px) translate(-100%,0)', b: { x: x - r - 2 - w, y: y + r + 2, w: w, h: h } }
        ];
        for (var i = 0; i < cands.length && !treffer; i++) if (frei(cands[i].b, o)) treffer = cands[i];
        if (!treffer && (o.prio || 0) >= 85) {
          for (var i2 = 0; i2 < cands.length && !treffer; i2++) if (frei(cands[i2].b, o, 1)) treffer = cands[i2];
          if (!treffer && o.notfall) for (var i3 = 0; i3 < cands.length && !treffer; i3++) if (frei(cands[i3].b, o, 2)) treffer = cands[i3];
        }
        if (treffer) { boxen.push({ x: treffer.b.x, y: treffer.b.y, w: w, h: h, eigner: o }); platziert.push({ o: o, t: treffer.t }); }
      } else if (o.art === 'mitte') {
        var versatz = o.versatz || [[0, 0]];
        for (var j = 0; j < versatz.length && !treffer; j++) {
          var cx = o.p.x + versatz[j][0], cy = o.p.y + versatz[j][1];
          var b = { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
          if (frei(b, o)) treffer = { b: b, t: 'translate(' + cx + 'px,' + cy + 'px) translate(-50%,-50%)' };
        }
        if (treffer) { boxen.push({ x: treffer.b.x, y: treffer.b.y, w: w, h: h, eigner: o }); platziert.push({ o: o, t: treffer.t }); }
      } else if (o.art === 'linie' || o.art === 'schild') {
        var anzahl = 0, maxAnz = o.maxAnzahl || 1, gesetzteMitten = [];
        var teile = o.linien || [];
        var runs = [];
        teile.forEach(function (teil) {
          var pts = teil.map(function (ll) { return map.latLngToLayerPoint(ll); });
          sichtbareStuecke(pts, sicht).forEach(function (run) { runs.push(run); });
        });
        runs.sort(function (a, b) { return b.laenge - a.laenge; });
        for (var ri = 0; ri < runs.length && anzahl < maxAnz; ri++) {
          var run = runs[ri];
          if (o.art === 'linie' && run.laenge < w + 24) continue;
          // Kandidatenpositionen entlang des Stücks
          var pos = [];
          if (o.art === 'linie') {
            var frac = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];
            frac.forEach(function (f) { var s = run.laenge * f; if (s - w / 2 > 4 && s + w / 2 < run.laenge - 4) pos.push(s); });
          } else {
            for (var s2 = Math.min(run.laenge / 2, 60); s2 < run.laenge - 12; s2 += 70) pos.push(s2);
            if (!pos.length && run.laenge > 20) pos.push(run.laenge / 2);
          }
          for (var pi = 0; pi < pos.length && anzahl < maxAnz; pi++) {
            var s0 = pos[pi], m = punktBei(run, s0), deg = 0, bb;
            if (o.art === 'linie') {
              var pA = punktBei(run, s0 - w / 2), pB = punktBei(run, s0 + w / 2);
              var ang = Math.atan2(pB.y - pA.y, pB.x - pA.x);
              // Kurve zu stark? Dann Text nicht entlang der Linie legen
              var chordLen = Math.hypot(pB.x - pA.x, pB.y - pA.y), abw = 0;
              for (var q = 1; q < 6; q++) {
                var sp = punktBei(run, s0 - w / 2 + (w * q) / 6);
                var ex = pA.x + (pB.x - pA.x) * q / 6, ey = pA.y + (pB.y - pA.y) * q / 6;
                abw = Math.max(abw, Math.hypot(sp.x - ex, sp.y - ey));
              }
              if (abw > h * 1.1 || chordLen < w * 0.8) continue;
              if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
              deg = ang * 180 / Math.PI;
              var cw = Math.abs(Math.cos(ang)) * w + Math.abs(Math.sin(ang)) * h, ch = Math.abs(Math.sin(ang)) * w + Math.abs(Math.cos(ang)) * h;
              bb = { x: m.x - cw / 2, y: m.y - ch / 2, w: cw, h: ch };
            } else {
              bb = { x: m.x - w / 2, y: m.y - h / 2, w: w, h: h };
              var zuNah = gesetzteMitten.some(function (g) { return Math.hypot(g.x - m.x, g.y - m.y) < (o.abstandPx || 300); });
              if (zuNah) continue;
            }
            if (!frei(bb, o)) continue;
            boxen.push({ x: bb.x, y: bb.y, w: bb.w, h: bb.h, eigner: o });
            gesetzteMitten.push(m);
            platziert.push({ o: o, t: 'translate(' + m.x + 'px,' + m.y + 'px) translate(-50%,-50%)' + (deg ? ' rotate(' + deg.toFixed(1) + 'deg)' : '') });
            anzahl++;
          }
        }
        treffer = anzahl > 0 ? true : null;
      }
      if (treffer && o.schluessel) gesetzt[o.schluessel] = true;
    });

    // In den Seiteninhalt schreiben
    var pane = this.pane;
    while (pane.firstChild) pane.removeChild(pane.firstChild);
    var frag = document.createDocumentFragment();
    this.letzte = [];
    platziert.forEach(function (pl) {
      var d = document.createElement('div');
      d.className = 'etikett ' + (pl.o.klasse || '');
      d.style.fontSize = pl.o.groesse + 'px';
      if (pl.o.abstand) d.style.letterSpacing = pl.o.abstand + 'px';
      d.style.transform = pl.t;
      if (pl.o.html) d.innerHTML = pl.o.html; else d.textContent = pl.o.text;
      frag.appendChild(d);
      self.letzte.push({ text: pl.o.text, klasse: pl.o.klasse, schluessel: pl.o.schluessel });
    });
    pane.appendChild(frag);

    // Markierungen, deren Etikett keinen Platz gefunden hat und die das wünschen ("blendeAus"),
    // werden vorübergehend ausgeblendet - ein Gipfel ohne Namen hilft Kindern nicht.
    var platzierteSchluessel = {};
    platziert.forEach(function (pl) { platzierteSchluessel[pl.o.schluessel] = true; });
    items.forEach(function (o) {
      if (!o.markierungEl) return;
      var el = typeof o.markierungEl === 'function' ? o.markierungEl() : o.markierungEl;
      if (el) el.style.visibility = platzierteSchluessel[o.schluessel] ? '' : 'hidden';
    });
  };

  Beschriftung._intern = { sichtbareStuecke: sichtbareStuecke, punktBei: punktBei };   // für Tests
  NS.Beschriftung = Beschriftung;
})();
