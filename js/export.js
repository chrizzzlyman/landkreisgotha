/* Karte als JPEG-Bild speichern.
   Zeichnet die gerade sichtbare Karte (Höhenkarte, Flächen, Linien, Gipfel, Beschriftungen) auf eine Leinwand,
   fügt Titel, Maßstab, Nordpfeil, Legende und Quellenangabe hinzu und lädt das Bild herunter.
   Dafür ist keine fremde Bibliothek nötig, und es funktioniert auch ohne Internet. */
(function () {
  'use strict';
  var NS = window.Gotha = window.Gotha || {};
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var TINTE = '#16304a', TINTE2 = '#4a5d70';
  var SCHRIFT = 'Nunito, "Segoe UI", system-ui, sans-serif', ANZEIGE = 'Fredoka, Nunito, "Segoe UI", system-ui, sans-serif';

  function liste(x) { return Array.prototype.slice.call(x); }

  // ------------------------------------------------------------ kleine Helfer
  function svgBild(text) {
    return new Promise(function (ok, fehler) {
      var img = new Image();
      var url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); fehler(new Error('SVG konnte nicht gezeichnet werden')); };
      img.src = url;
    });
  }
  // SVG-Element -> Bild in der gewünschten Pixelgröße (Vektor wird dabei scharf neu gerechnet)
  function svgElementBild(el, breite, hoehe) {
    var klon = el.cloneNode(true);
    klon.removeAttribute('style'); klon.removeAttribute('class');
    klon.setAttribute('xmlns', SVG_NS);
    klon.setAttribute('width', Math.max(1, Math.round(breite)));
    klon.setAttribute('height', Math.max(1, Math.round(hoehe)));
    return svgBild(new XMLSerializer().serializeToString(klon));
  }
  function rundRechteck(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function istDurchsichtig(farbe) { return !farbe || farbe === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(farbe); }

  // ------------------------------------------------------------ Karte zeichnen
  function zeichneKacheln(ctx, schicht, cr) {
    var tiles = [];
    if (schicht && schicht._tiles) {
      Object.keys(schicht._tiles).forEach(function (k) { var t = schicht._tiles[k]; if (t && t.current && t.el) tiles.push(t.el); });
    }
    var deckkraft = 1;
    if (tiles.length) {
      var layer = tiles[0].parentNode && tiles[0].parentNode.parentNode;
      var o = layer && parseFloat(getComputedStyle(layer).opacity);
      if (!isNaN(o)) deckkraft = o;
    }
    ctx.save(); ctx.globalAlpha = deckkraft;
    tiles.forEach(function (c) {
      if (c.tagName !== 'CANVAS' && c.tagName !== 'IMG') return;
      var r = c.getBoundingClientRect();
      ctx.drawImage(c, r.left - cr.left - 0.4, r.top - cr.top - 0.4, r.width + 0.8, r.height + 0.8);   // minimal überlappen: keine Nähte
    });
    ctx.restore();
  }

  function zeichneSvgEbene(ctx, el, cr) {
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height || !el.firstChild) return Promise.resolve();
    return svgElementBild(el, r.width * ctx.skala, r.height * ctx.skala).then(function (img) {
      ctx.drawImage(img, r.left - cr.left, r.top - cr.top, r.width, r.height);
    });
  }

  function zeichneMarker(ctx, m, cr) {
    var cs = getComputedStyle(m);
    if (cs.visibility === 'hidden' || cs.display === 'none') return Promise.resolve();
    var sv = m.querySelector('svg');
    if (!sv) return Promise.resolve();
    var r = sv.getBoundingClientRect();
    if (!r.width) return Promise.resolve();
    return svgElementBild(sv, r.width * ctx.skala, r.height * ctx.skala).then(function (img) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
      ctx.drawImage(img, r.left - cr.left, r.top - cr.top, r.width, r.height);
      ctx.restore();
    });
  }

  function zeichneEtikett(ctx, el, cr) {
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return;
    var r = el.getBoundingClientRect();
    var w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    var m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || '');
    var winkel = m ? parseFloat(m[1]) * Math.PI / 180 : 0;
    ctx.save();
    ctx.translate(r.left - cr.left + r.width / 2, r.top - cr.top + r.height / 2);
    if (winkel) ctx.rotate(winkel);

    var rand = parseFloat(cs.borderTopWidth) || 0;
    if (!istDurchsichtig(cs.backgroundColor)) {            // Straßenschild
      var rad = parseFloat(cs.borderTopLeftRadius) || 0;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
      rundRechteck(ctx, -w / 2, -h / 2, w, h, rad); ctx.fillStyle = rand ? cs.borderTopColor : cs.backgroundColor; ctx.fill();
      ctx.restore();
      if (rand) { rundRechteck(ctx, -w / 2 + rand, -h / 2 + rand, w - 2 * rand, h - 2 * rand, Math.max(0, rad - rand)); ctx.fillStyle = cs.backgroundColor; ctx.fill(); }
    }

    // Textstücke (normal und fett, z. B. "Hainsberg" + "391 m")
    var abstand = parseFloat(cs.letterSpacing) || 0;
    var gross = cs.textTransform === 'uppercase';
    var stuecke = [];
    liste(el.childNodes).forEach(function (n) {
      var t = n.nodeType === 3 ? n.nodeValue : n.textContent;
      var c2 = n.nodeType === 3 ? cs : getComputedStyle(n);
      if (!t) return;
      stuecke.push({ t: gross ? t.toUpperCase() : t, font: (c2.fontStyle || 'normal') + ' ' + c2.fontWeight + ' ' + c2.fontSize + ' ' + c2.fontFamily });
    });
    var halo = cs.getPropertyValue('--halo').trim();
    var mitHalo = halo && cs.textShadow && cs.textShadow !== 'none';
    var x0 = -w / 2 + rand + (parseFloat(cs.paddingLeft) || 0);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    [mitHalo ? 'halo' : null, 'text'].forEach(function (durchgang) {
      if (!durchgang) return;
      var x = x0;
      stuecke.forEach(function (st) {
        ctx.font = st.font;
        if (durchgang === 'halo') { ctx.strokeStyle = halo; ctx.lineWidth = 4.2; } else ctx.fillStyle = cs.color;
        function malen(t, px) { if (durchgang === 'halo') ctx.strokeText(t, px, 0.5); else ctx.fillText(t, px, 0.5); }
        if (!abstand) { malen(st.t, x); x += ctx.measureText(st.t).width; }
        else { for (var i = 0; i < st.t.length; i++) { malen(st.t[i], x); x += ctx.measureText(st.t[i]).width + abstand; } }
      });
    });
    ctx.restore();
  }

  function zeichneKarte(ctx, opt, cr) {
    var pane0 = opt.karte.getPane('mapPane');
    var panes = liste(pane0.children).filter(function (p) {
      return /leaflet-pane/.test(p.className) && !/treffer|popup|tooltip/i.test(p.className) && getComputedStyle(p).display !== 'none';
    }).sort(function (a, b) { return (parseInt(getComputedStyle(a).zIndex, 10) || 0) - (parseInt(getComputedStyle(b).zIndex, 10) || 0); });
    var reihe = Promise.resolve();
    panes.forEach(function (p) {
      var ist = p === opt.karte.getPane('reliefPane');
      if (ist) reihe = reihe.then(function () { zeichneKacheln(ctx, opt.relief, cr); });
      liste(p.children).forEach(function (c) { if (c.tagName && c.tagName.toLowerCase() === 'svg') reihe = reihe.then(function () { return zeichneSvgEbene(ctx, c, cr); }); });
      liste(p.querySelectorAll('.leaflet-marker-icon')).forEach(function (m) { reihe = reihe.then(function () { return zeichneMarker(ctx, m, cr); }); });
      liste(p.querySelectorAll('.etikett')).forEach(function (e) { reihe = reihe.then(function () { zeichneEtikett(ctx, e, cr); }); });
    });
    return reihe;
  }

  // ------------------------------------------------------------ Maßstab und Nordpfeil
  function massstab(ctx, karte, hoehe) {
    var ziel = 130, y = hoehe - 20;
    var m = karte.distance(karte.containerPointToLatLng([20, y]), karte.containerPointToLatLng([20 + ziel, y]));
    var pot = Math.pow(10, Math.floor(Math.log(m) / Math.LN10)), schoen = pot;
    [1, 2, 5, 10].forEach(function (f) { if (pot * f <= m) schoen = pot * f; });
    var px = ziel * schoen / m;
    var text = schoen >= 1000 ? (schoen / 1000) + ' km' : schoen + ' m';
    ctx.save();
    ctx.font = '800 13px ' + SCHRIFT; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(text).width, breite = Math.max(px, tw) + 20;
    rundRechteck(ctx, 10, y - 22, breite, 36, 10); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.strokeStyle = TINTE; ctx.lineWidth = 2.5; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(20, y - 2); ctx.lineTo(20, y + 5); ctx.lineTo(20 + px, y + 5); ctx.lineTo(20 + px, y - 2); ctx.stroke();
    ctx.fillStyle = TINTE; ctx.textAlign = 'left'; ctx.fillText(text, 20, y - 12);
    ctx.restore();
  }
  function nordpfeil(ctx, breite) {
    var cx = breite - 38, cy = 42;
    ctx.save(); ctx.translate(cx, cy);
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = TINTE; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(7, 15); ctx.lineTo(0, 10); ctx.lineTo(-7, 15); ctx.closePath(); ctx.fillStyle = TINTE; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(7, 15); ctx.lineTo(0, 10); ctx.closePath(); ctx.fillStyle = '#c92a2a'; ctx.fill();
    ctx.font = '900 13px ' + SCHRIFT; ctx.fillStyle = TINTE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, -14);
    ctx.restore();
  }

  // ------------------------------------------------------------ Legende
  function glyphMass(e) {
    if (e.band) return { w: 28, h: 16 };
    if (/^\s*<svg/.test(e.z)) { var m = /width="(\d+(?:\.\d+)?)"[^>]*height="(\d+(?:\.\d+)?)"/.exec(e.z); return { w: m ? +m[1] : 26, h: m ? +m[2] : 26 }; }
    var t = />([^<]*)</.exec(e.z); e.schildText = t ? t[1].replace(/&amp;/g, '&') : ''; e.schildArt = /bundesstr/.test(e.z) ? 'bundesstr' : 'autobahn';
    return { w: Math.round(e.schildText.length * 10 + 22), h: 24 };
  }
  function legendeAnordnen(mctx, eintraege, breite) {
    var x = 16, y = 0, zeile = 34, luecke = 26, rechts = breite - 16, plaetze = [];
    eintraege.forEach(function (e) {
      if (e.g) {
        mctx.font = '600 15px ' + ANZEIGE;
        var gw = mctx.measureText(e.g).width;
        if (x > 16) { x = 16; y += zeile; }
        plaetze.push({ e: e, x: x, y: y, gw: gw }); x += gw + 14;
        return;
      }
      var gm = glyphMass(e);
      mctx.font = '700 14px ' + SCHRIFT;
      var tw = mctx.measureText(e.t).width, gesamt = gm.w + 8 + tw;
      if (x > 16 && x + gesamt > rechts) { x = 16; y += zeile; }
      plaetze.push({ e: e, x: x, y: y, gm: gm, tw: tw }); x += gesamt + luecke;
    });
    return { plaetze: plaetze, hoehe: eintraege.length ? y + zeile : 0 };
  }
  function zeichneLegende(ctx, anord, oben) {
    anord.plaetze.forEach(function (p) {
      var e = p.e, my = oben + p.y + 17;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      if (e.g) { ctx.font = '600 15px ' + ANZEIGE; ctx.fillStyle = TINTE2; ctx.fillText(e.g, p.x, my); return; }
      var gm = p.gm, gx = p.x, gy = my - gm.h / 2;
      if (e.band) { ctx.fillStyle = e.band; rundRechteck(ctx, gx, gy, gm.w, gm.h, 3); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke(); }
      else if (e.img) ctx.drawImage(e.img, gx, gy, gm.w, gm.h);
      else if (e.schildText !== undefined) {
        var SCHILD = { autobahn: ['#fff', '#1d4ed8', '#fff'], bundesstr: ['#111', '#ffd43b', '#111'] };
        var sc = SCHILD[e.schildArt] || SCHILD.autobahn;       // [Rand, Füllung, Schrift]
        rundRechteck(ctx, gx, gy, gm.w, gm.h, 5); ctx.fillStyle = sc[0]; ctx.fill();
        rundRechteck(ctx, gx + 2, gy + 2, gm.w - 4, gm.h - 4, 3); ctx.fillStyle = sc[1]; ctx.fill();
        ctx.font = '900 14px ' + SCHRIFT; ctx.fillStyle = sc[2]; ctx.textAlign = 'center'; ctx.fillText(e.schildText, gx + gm.w / 2, my + 0.5); ctx.textAlign = 'left';
      }
      ctx.font = '700 14px ' + SCHRIFT; ctx.fillStyle = TINTE; ctx.fillText(e.t, gx + gm.w + 8, my + 0.5);
    });
  }

  function umbrechen(mctx, text, maxBreite) {
    var zeilen = [], aktuell = '';
    text.split(' ').forEach(function (wort) {
      var probe = aktuell ? aktuell + ' ' + wort : wort;
      if (aktuell && mctx.measureText(probe).width > maxBreite) { zeilen.push(aktuell); aktuell = wort; } else aktuell = probe;
    });
    if (aktuell) zeilen.push(aktuell);
    return zeilen;
  }

  // ------------------------------------------------------------ Hauptfunktion
  function herunterladen(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }
  function datum() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return { iso: d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()), de: z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear() };
  }

  /* opt: { karte (Leaflet-Karte), behaelter (Element der Karte), relief (Höhenkarten-Schicht oder null), mitLegende (true/false),
            eintraege (Legendenliste), titel, quellen (Text), herunterladen (Standard: true) }
     Ergebnis: Promise mit { blob, name, breite, hoehe } */
  function speichern(opt) {
    var cr = opt.behaelter.getBoundingClientRect();
    var W = Math.round(cr.width), H = Math.round(cr.height);
    var mit = !!opt.mitLegende, d = datum();
    var skala = Math.max(2, Math.min(3, 1800 / W));
    var fonts = ['600 20px Fredoka', '700 14px Nunito', '800 14px Nunito', '900 14px Nunito'];
    var schriften = Promise.all(fonts.map(function (f) { return (document.fonts && document.fonts.load) ? document.fonts.load(f).catch(function () {}) : null; }));

    return schriften.then(function () {
      var eintraege = mit ? (opt.eintraege || []).map(function (e) { return Object.assign({}, e); }) : [];
      return Promise.all(eintraege.map(function (e) {
        if (e.z && /^\s*<svg/.test(e.z)) return svgBild(e.z.replace(/^\s*<svg/, '<svg xmlns="' + SVG_NS + '"')).then(function (img) { e.img = img; }).catch(function () {});
        return null;
      })).then(function () { return eintraege; });
    }).then(function (eintraege) {
      var mctx = document.createElement('canvas').getContext('2d');
      var anord = legendeAnordnen(mctx, eintraege, W);
      var kopf = mit ? 56 : 0;
      var legH = mit ? 40 + anord.hoehe : 0;       // Titelzeile "Legende" + Einträge
      // Quellenzeile (bei Platzmangel zweizeilig)
      mctx.font = '700 12px ' + SCHRIFT;
      var links = opt.quellen || '', rechts = 'Gespeichert am ' + d.de;
      var einzeilig = mctx.measureText(links).width + mctx.measureText(rechts).width + 48 <= W;
      var zeilen = einzeilig ? [links] : umbrechen(mctx, links, W - 28).concat([rechts]);
      var fuss = einzeilig ? 30 : 14 + zeilen.length * 18;
      var gesamtH = kopf + H + legH + fuss;
      var s = Math.min(skala, 4096 / Math.max(W, gesamtH));

      var cv = document.createElement('canvas');
      cv.width = Math.round(W * s); cv.height = Math.round(gesamtH * s);
      var ctx = cv.getContext('2d');
      ctx.skala = s;
      ctx.scale(s, s);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, gesamtH);

      // Kopf
      if (mit) {
        ctx.fillStyle = TINTE; ctx.fillRect(0, 0, W, kopf);
        ctx.font = '600 28px ' + ANZEIGE; ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(opt.titel || 'Landkreis Gotha', 18, kopf / 2 + 1);
      }

      // Karte
      ctx.save();
      ctx.translate(0, kopf);
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      var hintergrund = getComputedStyle(opt.behaelter).backgroundColor;
      ctx.fillStyle = istDurchsichtig(hintergrund) ? '#eef3f6' : hintergrund; ctx.fillRect(0, 0, W, H);
      return zeichneKarte(ctx, opt, cr).then(function () {
        massstab(ctx, opt.karte, H);
        nordpfeil(ctx, W);
        ctx.restore();

        // Legende
        var y = kopf + H;
        if (mit && eintraege.length) {
          ctx.fillStyle = '#f3f7fb'; ctx.fillRect(0, y, W, legH);
          ctx.fillStyle = '#d5e0ea'; ctx.fillRect(0, y, W, 2);
          ctx.font = '600 18px ' + ANZEIGE; ctx.fillStyle = TINTE; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          ctx.fillText('Legende', 16, y + 24);
          zeichneLegende(ctx, anord, y + 38);
        } else if (mit) {
          ctx.fillStyle = '#f3f7fb'; ctx.fillRect(0, y, W, legH);
        }
        // Quellenzeile
        var fy = kopf + H + legH;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, fy, W, fuss);
        ctx.fillStyle = '#d5e0ea'; ctx.fillRect(0, fy, W, 1);
        ctx.font = '700 12px ' + SCHRIFT; ctx.fillStyle = TINTE2; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        if (einzeilig) { ctx.fillText(links, 14, fy + 15); ctx.textAlign = 'right'; ctx.fillText(rechts, W - 14, fy + 15); }
        else zeilen.forEach(function (z, i) { ctx.fillText(z, 14, fy + 16 + i * 18); });

        return new Promise(function (ok, fehler) {
          cv.toBlob(function (blob) { blob ? ok(blob) : fehler(new Error('Das Bild konnte nicht erzeugt werden')); }, 'image/jpeg', 0.92);
        });
      });
    }).then(function (blob) {
      var name = 'landkreis-gotha-karte-' + d.iso + '.jpg';
      if (opt.herunterladen !== false) herunterladen(blob, name);
      return { blob: blob, name: name };
    });
  }

  NS.Export = { speichern: speichern };
})();
