# Unser Landkreis Gotha – Kartenentdecker

Eine Karten-App für Grundschulkinder (Klasse 3 und 4). Die Kinder schalten Ansichten ein und aus und kombinieren sie:

| Ansicht | Inhalt |
|---|---|
| Landkreis & Nachbarn | Umriss des Landkreises Gotha, die 6 angrenzenden Kreise grau, mit Namen |
| Gemeinden | Umrissgrenzen aller 29 Gemeinden, bunt und beschriftet |
| Städte | die 5 Städte des Landkreises, dazu Nachbarstädte wie Erfurt und Eisenach |
| Dörfer | Dörfer und Ortsteile mit Namen |
| Umrisse der Orte | grobe Umrisse der Siedlungsflächen: Städte rot, Dörfer orange (lässt sich mit oder ohne die Ortspunkte zeigen) |
| Flüsse & Seen | größere Flüsse, Kanäle und Talsperren |
| Berge & Täler | Höhenkarte (Tiefland grün, Berge braun) und die 8 ausgewählten Berge mit Höhe |
| Autobahnen / Bundesstraßen | blaue und gelbe Straßen mit Schildern (z. B. „A 4") |
| Landstraßen | Landesstraßen (L) und Kreisstraßen (K) als dünne, graue Straßen ohne Beschriftung, dazu weitere Durchgangsstraßen: so sieht man, wie man von Ort zu Ort kommt. Beim Antippen einer Straße erscheint ihr Name (z. B. „L 1026“) |

Dazu gibt es eine **Ortssuche**, eine **Legende** („Was bedeutet das?"), eine **Schnellauswahl** und ein **Quiz „Wo liegt …?"** mit Sternen (Städte, Gemeinden, Dörfer, Berge, Flüsse).

**Menü einklappen:** Am Computer und auf dem Tablet im Querformat gibt es unter den Zoom-Knöpfen einen Knopf, der das Seitenmenü ein- und ausklappt. Dann ist die Karte so breit wie das Fenster, und der Kartenausschnitt bleibt dabei stehen. Auf dem Handy und auf dem hochkant gehaltenen Tablet öffnet und schließt der Menüknopf oben links in der Kopfzeile das Menü.

**Als Bild speichern:** Der Knopf mit dem Fotoapparat (oben rechts auf der Karte) speichert die gerade sichtbare Karte als JPEG-Datei, wahlweise mit Titel und Legende oder nur die Karte. Maßstab, Nordpfeil und Quellenangabe sind immer dabei. Das Bild entsteht im Browser, es wird nichts hochgeladen, und es geht auch ohne Internet (nur die Höhenkarte selbst braucht Internet).

Alle Symbole sind eingebaute Vektorgrafiken und die Schriften sind mitgeliefert. Dadurch sieht die App auf jedem Gerät gleich aus, auch ohne Emoji-Schrift und ohne Internet.

## So bringst du die App auf GitHub (GitHub Pages)

1. Auf github.com anmelden und oben rechts auf **+ → New repository** klicken.
2. Name eingeben, zum Beispiel `gotha-karte`. **Public** wählen und **Create repository** klicken.
3. Auf der neuen Seite auf **uploading an existing file** klicken.
4. **Den Inhalt dieses Ordners** (nicht den Ordner selbst) in das Fenster ziehen: `index.html`, `sw.js`, `manifest.webmanifest`, `css`, `js`, `lib`, `data`, `icons`, `tools`, `README.md` und die versteckte Datei `.nojekyll`. Danach **Commit changes** klicken.
5. Oben auf **Settings → Pages**. Bei „Branch" `main` und `/ (root)` wählen, dann **Save**.
6. Nach ein bis zwei Minuten steht dort der Link: `https://DEINNAME.github.io/gotha-karte/`

Den Link kannst du auf Tablets oder dem Whiteboard öffnen. Zum Beispiel als Lesezeichen oder als QR-Code.

## Als App auf dem Handy oder Tablet installieren

Die Karte ist eine *installierbare Web-App*. Das geht **nur über den GitHub-Pages-Link** (`https://…github.io/…`), nicht mit der Einzeldatei und nicht per Doppelklick auf `index.html`.

- **Android (Chrome):** Link öffnen. Unten im Menü der Karte erscheint der gelbe Knopf „App auf diesem Gerät installieren". Alternativ im Chrome-Menü (drei Punkte) „App installieren" oder „Zum Startbildschirm hinzufügen" wählen. Danach liegt das Symbol der Karte wie jede andere App auf dem Startbildschirm und öffnet sich im Vollbild.
- **iPhone und iPad (Safari):** Link öffnen, auf das Teilen-Symbol tippen und „Zum Home-Bildschirm" wählen.
- **Ohne Internet:** Nach dem ersten Öffnen mit Internet startet die App auch ohne Netz. Die Höhenkarte gibt es offline nur für Gegenden, die man schon einmal angesehen hat. Mit Internet holt sich die App beim Start immer die neuesten Dateien.

Eine Datei für den Play Store (APK) ist nicht enthalten. Dafür müsste man die Web-App zusätzlich verpacken, zum Beispiel mit PWABuilder.

**Ohne GitHub:** `index.html` per Doppelklick öffnen oder `gotha-karte-einzeldatei.html` verschicken. Beides funktioniert. Nur die **Höhenkarte braucht Internet**, alles andere läuft auch ohne.

## Daten aktualisieren

Die Kartendaten liegen als `data/grenzen.js` und `data/osm.js`. Sie werden mit `tools/build_data.py` erzeugt (Python 3 mit `shapely` und `pyproj`):

```bash
# 1) Verwaltungsgrenzen (Bundesamt für Kartographie und Geodäsie)
npm pack german-administrative-areas && tar xzf german-administrative-areas-*.tgz
python3 tools/build_data.py grenzen --bkg-dir package

# 2) Orte, Straßen, Gewässer, Berge aus OpenStreetMap
#    Abfrage aus tools/overpass-abfrage.txt auf https://overpass-turbo.eu ausführen,
#    "Rohdaten direkt von Overpass API" herunterladen als gotha-osm.json, dann:
python3 tools/build_data.py osm --osm gotha-osm.json

# 3) Umrisse der Orte (Siedlungsflächen aus OpenStreetMap)
#    Abfrage aus tools/overpass-siedlungen.txt wie oben ausführen und als gotha-siedlungen.json speichern, dann:
python3 tools/build_data.py siedlungen --osm gotha-siedlungen.json

# 4) Landstraßen (Landes- und Kreisstraßen)
#    Abfrage aus tools/overpass-landstrassen.txt wie oben ausführen und als gotha-landstrassen.json speichern, dann:
python3 tools/build_data.py landstrassen --osm gotha-landstrassen.json

# 5) Optional: alles in eine einzelne Datei packen
python3 tools/einzeldatei_bauen.py
```

Schritt 3 braucht die Ergebnisse von Schritt 1 und 2. Er verbindet Wohn-, Gewerbe- und Industrieflächen, die weniger als etwa 90 m auseinanderliegen, zu einer Ortsfläche, rundet die Ecken ab, vereinfacht sie und ordnet sie dem nächsten Ortspunkt zu. Flächen ohne Ort (z. B. einzelne Gewerbegebiete auf dem Feld) werden weggelassen. Die Werte stehen am Anfang von `tools/build_data.py` (`SIED_PUFFER_M`, `SIED_RUNDEN_M`, `SIED_TOL_M` usw.). Das Skript listet am Ende Flächen mit mehreren Orten auf (z. B. Gotha mit Siebleben) und Orte ohne Fläche.

Schritt 4 sammelt die Straßen mit Nummer L oder K und schreibt außerdem alle `secondary`/`tertiary`-Straßen ohne Nummer (meist Ortsdurchfahrten wie „Hauptstraße") als dünne „weitere Straßen", damit die Linien nicht an jedem Ortsschild abreißen. Kurze Straßen (unter 1 km im Landkreis) werden weggelassen. Ein Tippfehler in OpenStreetMap (Eintrag „1026" statt „L 1026") wird in `REF_KORREKTUR` ausgebessert. Am Ende nennt das Skript Orte, die mehr als 300 m von der nächsten Straße entfernt liegen. Die weiteren Straßen erscheinen erst ab einer bestimmten Zoomstufe. Die Landstraßen haben bewusst keine Schilder auf der Karte, damit sie dezent bleiben. Name und Länge stehen im Fenster, das beim Antippen aufgeht. Breite und Farbe stehen in `LAND_STIL` in `js/app.js`.

Das Skript gibt dabei Kontrollwerte aus und bricht bei Unstimmigkeiten ab: Fläche des Kreises gegen die Summe der Gemeinden, außerdem ein Vergleich der Gemeindenamen mit OpenStreetMap, die Liste der gefundenen Straßen, Gewässer und Seen.

Die OpenStreetMap-Daten in diesem Paket stammen vom **23.11.2026**. Für Kinder ist die Auswahl bewusst klein gehalten: Gezeigt werden elf Nachbarstädte sowie Flüsse ab 3 km und Bäche ab 8 km Länge im Landkreis. Gräben fehlen. Diese Werte stehen am Anfang von `tools/build_data.py` (`NACHBARSTAEDTE`, `FLUSS_MIN_KM`, `BACH_MIN_KM` usw.) und lassen sich dort ändern.

**Berge:** Es gibt genau diese acht, festgelegt in der Liste `BERGE_LISTE` in `tools/build_data.py`:

| Berg | Höhe | Hinweis |
|---|---|---|
| Großer Inselsberg | 916 m | höchster Berg im Landkreis (andere Quellen: 916,5 m) |
| Saukopf | 869 m | |
| Spießberg | 749 m | Höhe und Lage von komoot, in OpenStreetMap nicht eingetragen |
| Kienberg | 720 m | |
| Abtsberg | 697 m | der Berg bei Friedrichroda |
| Körnberg | 633 m | |
| Großer Seeberg | 410 m | |
| Hainsberg | 391 m | in OpenStreetMap als „Hainberg" bei Teutleben eingetragen |

Höhen und Lage kommen aus OpenStreetMap. Das Skript sucht jeden Berg anhand von Name und ungefährer Lage (`nahe`) und bricht ab, wenn es ihn nicht findet. Berge, die in OpenStreetMap fehlen, trägt man mit `manuell` (Länge, Breite, Höhe) ein.

Der Gebietsstand der Grenzen ist der 1.1.2021. Zwei spätere Änderungen sind im Skript eingearbeitet: Eisenach ist seit 1.7.2021 Teil des Wartburgkreises, und Herrenhof ist seit 1.1.2024 Teil von Georgenthal. Gibt es neue Zusammenschlüsse, ergänzt man sie im Block `KORREKTUREN` am Anfang von `build_data.py`.

## Aufbau

```
index.html          Startseite
css/style.css       Aussehen
js/app.js           Hauptprogramm (Ebenen, Popups, Suche, Legende)
js/beschriftung.js  Beschriftungen ohne Überlappung
js/relief.js        Höhenkarte (färbt Höhenkacheln kindgerecht ein)
js/quiz.js          Quiz "Wo liegt ...?"
js/symbole.js       Alle Symbole als Vektorgrafik (kein Emoji nötig)
js/export.js        Karte als JPEG-Bild speichern
js/pwa.js           Installierbare Web-App (Anmeldung des Service Workers, Installieren-Knopf)
sw.js               Service Worker: Start ohne Internet, Höhenkacheln merken
manifest.webmanifest  App-Name, Farben und Symbole für die Installation
icons/              App-Symbole (aus der Kreisgrenze gezeichnet)
data/               Kartendaten (erzeugt, nicht von Hand ändern)
lib/leaflet/        Kartenbibliothek Leaflet 1.9.4 (BSD-2-Clause)
lib/schriften/      Schriften Nunito und Fredoka (SIL Open Font License)
tools/              Werkzeuge zum Erzeugen der Daten
```

## Quellen und Lizenzen

- **Verwaltungsgrenzen:** © GeoBasis-DE / BKG, Datenlizenz Deutschland – Namensnennung – Version 2.0 (<https://www.govdata.de/dl-de/by-2-0>). Bearbeitet: vereinfacht, zwei Gebietsänderungen nachgetragen.
- **Orte, Straßen (auch Landes- und Kreisstraßen), Gewässer, Berge, Ortsumrisse:** © OpenStreetMap-Mitwirkende, Open Database License (<https://www.openstreetmap.org/copyright>). Die Ortsumrisse sind aus Wohn-, Gewerbe- und Industrieflächen berechnet und stark vereinfacht.
- **Höhenkarte:** Terrain Tiles (Amazon Open Data), u. a. NASA SRTM, Copernicus/EU-DEM – Quellen: <https://github.com/tilezen/joerd/blob/master/docs/attribution.md>.
- **Kartenbibliothek:** Leaflet © Volodymyr Agafonkin, BSD-2-Clause.
- **Schriften:** Nunito (© The Nunito Project Authors) und Fredoka (© The Fredoka Project Authors), beide SIL Open Font License 1.1. Lizenztext: `lib/schriften/LICENSE.txt`.
- **Spießberg (749 m):** Angabe von komoot (<https://www.komoot.com/highlight/4388273>), manuell eingetragen.

Die App speichert keine persönlichen Daten. Es gibt kein Tracking. Gemerkt wird nur, dass der Willkommensbildschirm schon gezeigt wurde (im Browser des Geräts).
