/* Quiz "Wo liegt …?" – 10 Fragen, Sterne, immer freundliche Rückmeldung */
(function () {
  'use strict';
  var NS = window.Gotha = window.Gotha || {};

  var LOB = ['Super!', 'Richtig!', 'Toll gemacht!', 'Prima!', 'Stark!', 'Genau!'];
  var FRAGEN_PRO_RUNDE = 10;

  function mische(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; }
    return b;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function Quiz(api) {
    this.api = api;
    this.panel = document.getElementById('quizleiste');
    this.phase = null;           // null | 'wahl' | 'frage' | 'ende'
    this.versteckt = {};
    this.timer = null;
    this.sperre = false;
    var self = this;
    this.panel.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-aktion],[data-kat]');
      if (!b || !self.panel.contains(b)) return;
      if (b.hasAttribute('data-kat')) { self.startRunde(b.getAttribute('data-kat')); return; }
      var a = b.getAttribute('data-aktion');
      if (a === 'abbruch' || a === 'ende' || a === 'karte') self.beenden(false);
      else if (a === 'tipp') self.tipp();
      else if (a === 'nochmal') self.startRunde(self.kat.id);
      else if (a === 'anderes') self.zeigeWahl();
    });
  }

  Quiz.prototype.aktiv = function () { return this.phase === 'frage'; };
  Quiz.prototype.verborgen = function () { return this.phase === 'frage' || this.phase === 'ende' ? this.versteckt : {}; };

  Quiz.prototype.start = function () {
    if (this.phase) { this.beenden(false); return; }
    this.vorher = this.api.holeZustand();
    this.zeigeWahl();
  };

  Quiz.prototype.zeigeWahl = function () {
    clearTimeout(this.timer); this.api.entferneHervor();
    this.phase = 'wahl'; this.versteckt = {};
    if (this.vorher) this.api.setzeZustand(this.vorher);
    var kat = this.api.kategorien();
    var h = '<h3>🎯 Quiz: Wo liegt …?</h3><p style="margin:0;font-weight:700">Was möchtest du üben? Du bekommst bis zu ⭐⭐⭐ pro Frage.</p><div class="quiz-wahl">';
    kat.forEach(function (k) {
      var n = Math.min(FRAGEN_PRO_RUNDE, k.ziele.length);
      h += '<button type="button" data-kat="' + esc(k.id) + '"><span aria-hidden="true">' + k.bild + '</span>' + esc(k.titel) + '<small>' + n + ' Fragen</small></button>';
    });
    h += '</div><div class="quiz-knoepfe"><button type="button" class="klein" data-aktion="abbruch">Abbrechen</button></div>';
    this.panel.innerHTML = h; this.panel.hidden = false;
    this.api.aktualisiere();
  };

  Quiz.prototype.startRunde = function (katId) {
    var kat = this.api.kategorien().filter(function (k) { return k.id === katId; })[0];
    if (!kat) return;
    this.kat = kat;
    this.fragen = mische(kat.ziele).slice(0, FRAGEN_PRO_RUNDE);
    this.i = 0; this.sterne = 0;
    var z = this.api.holeZustand(), neu = {};
    Object.keys(z).forEach(function (k) { neu[k] = kat.ebenen.indexOf(k) >= 0; });
    this.api.setzeZustand(neu);
    this.versteckt = {};
    kat.verberge.forEach(function (k) { this.versteckt[k] = true; }, this);
    this.api.schliessePopup(); this.api.entferneHervor();
    this.naechste();
    this.api.zeigeGanz();
  };

  Quiz.prototype.naechste = function () {
    clearTimeout(this.timer); this.api.entferneHervor();
    if (this.i >= this.fragen.length) { this.ende(); return; }
    this.phase = 'frage'; this.versuch = 0; this.sperre = false;
    var ziel = this.fragen[this.i];
    this.panel.innerHTML =
      '<div class="quiz-zeile"><strong>Frage ' + (this.i + 1) + ' von ' + this.fragen.length + '</strong><span class="sterne" aria-label="' + this.sterne + ' Sterne">⭐ ' + this.sterne + '</span></div>' +
      '<div class="quiz-frage">Wo liegt ' + esc(this.kat.frage) + ' <span class="ziel">' + esc(ziel.name) + '</span>?</div>' +
      '<div class="quiz-meldung" id="quizmeldung" aria-live="polite">Tippe auf die Karte.</div>' +
      '<div class="quiz-knoepfe"><button type="button" class="klein" data-aktion="tipp">💡 Tipp</button><button type="button" class="klein" data-aktion="ende">Beenden</button></div>';
    this.panel.hidden = false;
    this.api.aktualisiere();
  };

  Quiz.prototype.meldung = function (text, klasse) {
    var m = document.getElementById('quizmeldung');
    if (!m) return;
    m.textContent = text; m.className = 'quiz-meldung ' + (klasse || '');
  };

  Quiz.prototype.tipp = function () {
    if (this.phase !== 'frage' || this.sperre) return;
    var ziel = this.fragen[this.i], z = this.api.ziel(ziel.id);
    var r = z && z.ll ? this.api.richtung(z.ll) : null;
    var extra = ziel.h ? ' Er ist ' + ziel.h + ' m hoch.' : '';
    this.meldung(r ? 'Tipp: Das liegt im ' + r + ' des Landkreises.' + extra : 'Schau dir die Karte genau an.', '');
  };

  Quiz.prototype.antwort = function (id) {
    if (this.phase !== 'frage' || this.sperre) return;
    var ziel = this.fragen[this.i], z = this.api.ziel(id);
    if (!z) return;
    if (id === ziel.id) return this.richtig();
    if (z.kat !== this.kat.id) {
      this.meldung('Das ist ' + z.name + '. Suche ' + this.kat.frage + ' ' + ziel.name + '!', 'nochmal');
      return;
    }
    this.versuch++;
    if (this.versuch >= 2) {
      this.sperre = true;
      this.api.hebeHervor(ziel.id, 3200);
      this.meldung('Hier liegt ' + ziel.name + '! Merk dir die Stelle.', 'nochmal');
      var self = this;
      this.timer = setTimeout(function () { self.i++; self.naechste(); }, 3000);
    } else {
      this.meldung('Nicht ganz: Das ist ' + z.name + '. Versuche es noch einmal!', 'nochmal');
    }
  };

  Quiz.prototype.richtig = function () {
    var ziel = this.fragen[this.i], s = this.versuch === 0 ? 3 : 2;
    this.sterne += s; this.sperre = true;
    this.api.hebeHervor(ziel.id, 2200);
    this.meldung(LOB[Math.floor(Math.random() * LOB.length)] + ' ' + new Array(s + 1).join('⭐'), 'gut');
    var self = this;
    this.timer = setTimeout(function () { self.i++; self.naechste(); }, 1900);
  };

  Quiz.prototype.ende = function () {
    this.phase = 'ende';
    var max = this.fragen.length * 3, anteil = this.sterne / max;
    var spruch = anteil >= 0.9 ? 'Du bist ein echter Kartenprofi!' : anteil >= 0.6 ? 'Sehr gut gemacht!' : 'Gut geübt! Beim nächsten Mal klappt es noch besser.';
    var voll = Math.max(1, Math.round(anteil * 5));
    this.panel.innerHTML =
      '<div class="quiz-ende"><h3>Geschafft! 🎉</h3><div class="gross" aria-hidden="true">' + new Array(voll + 1).join('⭐') + '</div>' +
      '<div class="quiz-frage">' + this.sterne + ' von ' + max + ' Sternen</div><p style="margin:6px 0 10px;font-weight:800">' + esc(spruch) + '</p>' +
      '<div class="quiz-knoepfe" style="justify-content:center"><button type="button" class="klein primaer" data-aktion="nochmal">🔁 Nochmal</button>' +
      '<button type="button" class="klein" data-aktion="anderes">Anderes Quiz</button><button type="button" class="klein" data-aktion="karte">Zur Karte</button></div></div>';
    this.api.aktualisiere();
  };

  // behalteAnsicht = true: die aktuelle Kartenansicht bleibt (z. B. nach Suche oder Schnellauswahl)
  Quiz.prototype.beenden = function (behalteAnsicht) {
    clearTimeout(this.timer); this.api.entferneHervor();
    var war = this.phase;
    this.phase = null; this.versteckt = {}; this.sperre = false;
    this.panel.hidden = true; this.panel.innerHTML = '';
    if (!behalteAnsicht && this.vorher) this.api.setzeZustand(this.vorher);
    this.vorher = null;
    this.api.aktualisiere();
    if (war === 'frage' && !behalteAnsicht) this.api.toast('Quiz beendet. Du kannst jederzeit neu starten!', 2800);
  };

  NS.Quiz = Quiz;
})();
