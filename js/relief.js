/* Höhenkarte (Topografie): lädt Höhenkacheln "Terrarium" und färbt sie kindgerecht ein.
 * Tiefland = grün, Hügel = gelb, Berge = braun. Dazu eine sanfte Schattierung.
 * Die Kacheln kommen live aus dem Internet (AWS Open Data "Terrain Tiles"). */
(function () {
  'use strict';
  var NS = window.Gotha = window.Gotha || {};

  var QUELLEN = [
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
  ];

  // Farbstufen: [Höhe in m, [r,g,b]]
  var RAMPE = [
    [0,   [112, 184, 106]],
    [220, [128, 192, 108]],
    [260, [168, 208, 120]],
    [300, [208, 222, 132]],
    [350, [240, 226, 142]],
    [420, [240, 205, 125]],
    [500, [226, 176, 106]],
    [600, [200, 144, 90]],
    [720, [165, 112, 72]],
    [850, [128, 86, 58]],
    [1000,[96, 64, 46]]
  ];

  // Beschriftete Stufen für die Legende (Mitte der Stufe wird eingefärbt)
  var STUFEN = [
    { von: 0,   bis: 250, text: 'flaches Land (unter 250 m)' },
    { von: 250, bis: 350, text: 'Hügelland (250 bis 350 m)' },
    { von: 350, bis: 500, text: 'Bergland (350 bis 500 m)' },
    { von: 500, bis: 700, text: 'hohe Berge (500 bis 700 m)' },
    { von: 700, bis: 1000, text: 'Gipfel (über 700 m)' }
  ];

  function farbe(h) {
    if (h <= RAMPE[0][0]) return RAMPE[0][1];
    for (var i = 1; i < RAMPE.length; i++) {
      if (h <= RAMPE[i][0]) {
        var a = RAMPE[i - 1], b = RAMPE[i], t = (h - a[0]) / (b[0] - a[0]);
        return [a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t];
      }
    }
    return RAMPE[RAMPE.length - 1][1];
  }
  function farbeCss(h) { var c = farbe(h); return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }

  var SONNE_HOEHE = 42 * Math.PI / 180;          // Licht von links oben (Nordwest)
  var SONNE_RICHTUNG = 315;
  var ZENIT = Math.PI / 2 - SONNE_HOEHE;
  var AZIMUT = ((360 - SONNE_RICHTUNG + 90) % 360) * Math.PI / 180;
  var UEBERHOEHUNG = 2.6;

  var ReliefSchicht = L.GridLayer.extend({
    options: { tileSize: 256, maxNativeZoom: 12, minZoom: 8, opacity: 0.88, updateWhenZooming: false, keepBuffer: 2 },

    initialize: function (opts) {
      L.GridLayer.prototype.initialize.call(this, opts);
      this._fehler = 0;
      this._ok = 0;
    },

    createTile: function (coords, done) {
      var self = this;
      var tile = document.createElement('canvas');
      tile.width = tile.height = 256;
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var versuch = 0;
      function laden() {
        var url = QUELLEN[versuch].replace('{z}', coords.z).replace('{x}', coords.x).replace('{y}', coords.y);
        img.src = url;
      }
      img.onload = function () {
        try {
          self._zeichne(tile, img, coords);
          self._ok++;
          done(null, tile);
        } catch (e) {
          self._melde(e);
          done(e, tile);
        }
      };
      img.onerror = function () {
        versuch++;
        if (versuch < QUELLEN.length) { laden(); return; }
        self._melde(new Error('Kachel nicht ladbar'));
        done(new Error('Kachel nicht ladbar'), tile);
      };
      laden();
      return tile;
    },

    _melde: function (e) {
      this._fehler++;
      if (this._fehler === 3 && this._ok === 0 && typeof this.options.beiFehler === 'function') this.options.beiFehler(e);
    },

    _zeichne: function (tile, img, coords) {
      var N = 256;
      var tmp = document.createElement('canvas');
      tmp.width = tmp.height = N;
      var tctx = tmp.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(img, 0, 0);
      var src = tctx.getImageData(0, 0, N, N).data;       // kann bei fehlendem CORS einen Fehler werfen

      var hoehe = new Float32Array(N * N);
      for (var i = 0, p = 0; i < N * N; i++, p += 4) hoehe[i] = src[p] * 256 + src[p + 1] + src[p + 2] / 256 - 32768;

      // Meter pro Pixel in dieser Kachel
      var n = Math.PI - 2 * Math.PI * (coords.y + 0.5) / Math.pow(2, coords.z);
      var breite = Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
      var mpp = 156543.03392 * Math.cos(breite) / Math.pow(2, coords.z);

      var ctx = tile.getContext('2d');
      var out = ctx.createImageData(N, N);
      var d = out.data;
      var cosZ = Math.cos(ZENIT), sinZ = Math.sin(ZENIT);
      for (var y = 0; y < N; y++) {
        var y0 = y > 0 ? y - 1 : 0, y1 = y < N - 1 ? y + 1 : N - 1;
        for (var x = 0; x < N; x++) {
          var x0 = x > 0 ? x - 1 : 0, x1 = x < N - 1 ? x + 1 : N - 1;
          var a = hoehe[y0 * N + x0], b = hoehe[y0 * N + x], c = hoehe[y0 * N + x1];
          var dd = hoehe[y * N + x0], f = hoehe[y * N + x1];
          var g = hoehe[y1 * N + x0], h = hoehe[y1 * N + x], ii = hoehe[y1 * N + x1];
          var dzdx = ((c + 2 * f + ii) - (a + 2 * dd + g)) / (8 * mpp * ((x1 - x0) / 2));
          var dzdy = ((g + 2 * h + ii) - (a + 2 * b + c)) / (8 * mpp * ((y1 - y0) / 2));
          var steig = Math.atan(UEBERHOEHUNG * Math.sqrt(dzdx * dzdx + dzdy * dzdy));
          var expo;
          if (dzdx !== 0) { expo = Math.atan2(dzdy, -dzdx); if (expo < 0) expo += 2 * Math.PI; }
          else if (dzdy > 0) expo = Math.PI / 2; else if (dzdy < 0) expo = 3 * Math.PI / 2; else expo = 0;
          var hs = cosZ * Math.cos(steig) + sinZ * Math.sin(steig) * Math.cos(AZIMUT - expo);
          var licht = 0.80 + 1.0 * (hs - cosZ);
          if (licht < 0.55) licht = 0.55; else if (licht > 1.18) licht = 1.18;
          var col = farbe(hoehe[y * N + x]);
          var o = (y * N + x) * 4;
          d[o] = Math.min(255, col[0] * licht);
          d[o + 1] = Math.min(255, col[1] * licht);
          d[o + 2] = Math.min(255, col[2] * licht);
          d[o + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
    }
  });

  NS.Relief = {
    Schicht: ReliefSchicht,
    farbe: farbe,
    farbeCss: farbeCss,
    stufen: STUFEN.map(function (s) { return { von: s.von, bis: s.bis, text: s.text, farbe: farbeCss((s.von + Math.min(s.bis, 900)) / 2) }; })
  };
})();
