#!/usr/bin/env python3
"""
Baut die Kartendaten fuer die Gotha-Karte.

Zwei Schritte (einzeln oder zusammen aufrufbar):

  1) Verwaltungsgrenzen (BKG VG250, Stand 01.01.2021, ueber das npm-Paket
     "german-administrative-areas"):
         python3 tools/build_data.py grenzen --bkg-dir <ordner mit kreise.geo.json + gemeinden.geo.json>

     Korrekturen gegenueber dem Stand 2021 (siehe KORREKTUREN unten):
       * Eisenach ist seit 01.07.2021 Teil des Wartburgkreises
       * Herrenhof ist seit 01.01.2024 Teil von Georgenthal

  2) OpenStreetMap-Daten (Staedte, Doerfer, Berge, Gewaesser, Strassen):
         python3 tools/build_data.py osm --osm gotha-osm.json

     Die Eingabedatei entsteht mit der Abfrage in tools/overpass-abfrage.txt
     (Overpass-API, Ausgabeformat JSON, "out geom").

Ausgabe: data/grenzen.js  und  data/osm.js   (als  window.GOTHA_... = {...};)
Die Dateien sind absichtlich .js statt .json, damit die Seite auch per Doppelklick
(file://) funktioniert.

Benoetigt:  pip install shapely pyproj
"""
import argparse
import json
import math
import os
import re
import sys
from collections import defaultdict

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon, mapping, shape
from shapely.ops import linemerge, polygonize, polylabel, unary_union

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
DATA = os.path.join(WURZEL, "data")

GOTHA_AGS = "16067"
# Korrekturen am Gebietsstand 2021 (Quelle: Wikipedia "Landkreis Gotha", "Wartburgkreis")
KORREKTUREN = {
    "kreis_zusammenlegen": [("16056", "16063")],        # Eisenach -> Wartburgkreis (01.07.2021)
    "gemeinde_zusammenlegen": [("16067036", "16067092")],  # Herrenhof -> Georgenthal (01.01.2024)
}
TOL_GEMEINDEN_M = 35.0     # Vereinfachung (Meter) der Grenzen
TOL_LINIEN_M = 15.0        # Vereinfachung Strassen/Gewaesser
NACHBAR_MIN_GRENZE_M = 500.0

# Redaktionelle Auswahl fuer Kinder (nicht jede OSM-Stadt ist fuer Grundschueler wichtig)
NACHBARSTAEDTE = ["Erfurt", "Eisenach", "Arnstadt", "Bad Langensalza", "Mühlhausen", "Sömmerda", "Ilmenau",
                  "Zella-Mehlis", "Schmalkalden", "Oberhof", "Ruhla"]
BERGE_MIN_HOEHE = 550          # Meter
BERGE_MIN_ABSTAND_M = 2500     # Gipfel naeher beieinander werden nur einmal gezeigt (der hoehere)
BERGE_MAX = 40
BERGE_AUSSCHLUSS = ("zigeuner",)    # Namen, die wir Kindern nicht anzeigen
BACH_MIN_KM = 8.0
FLUSS_MIN_KM = 3.0
SEE_MIN_HA = 3.0

TO_WGS = Transformer.from_crs(25832, 4326, always_xy=True)
TO_UTM = Transformer.from_crs(4326, 25832, always_xy=True)

HIMMELSRICHTUNGEN = ["Norden", "Nordosten", "Osten", "Südosten", "Süden", "Südwesten", "Westen", "Nordwesten"]


# ----------------------------------------------------------------- Hilfsfunktionen
def features(x):
    """Findet Features in verschachtelten Listen/FeatureCollections."""
    if isinstance(x, dict):
        if x.get("type") == "FeatureCollection":
            yield from x["features"]
        elif x.get("type") == "Feature":
            yield x
    elif isinstance(x, list):
        for y in x:
            yield from features(y)


def wgs(geom):
    return shapely.transform(geom, lambda c: np.column_stack(TO_WGS.transform(c[:, 0], c[:, 1])))


def utm(geom):
    return shapely.transform(geom, lambda c: np.column_stack(TO_UTM.transform(c[:, 0], c[:, 1])))


def runden(geom, nachkomma=5):
    return shapely.transform(geom, lambda c: np.round(c, nachkomma))


def geojson_geom(geom_wgs):
    return mapping(runden(geom_wgs))


def richtung(dx, dy):
    winkel = (math.degrees(math.atan2(dx, dy)) + 360) % 360
    return HIMMELSRICHTUNGEN[int(((winkel + 22.5) % 360) // 45)]


def pol_label(geom_utm):
    """Beschriftungspunkt im groessten Teilpolygon (Pol der Unzugaenglichkeit)."""
    if geom_utm.geom_type == "MultiPolygon":
        geom_utm = max(geom_utm.geoms, key=lambda g: g.area)
    p = polylabel(geom_utm, tolerance=30)
    lon, lat = TO_WGS.transform(p.x, p.y)
    return [round(lon, 5), round(lat, 5)]


def schreibe_js(name, objekt, dateiname):
    os.makedirs(DATA, exist_ok=True)
    pfad = os.path.join(DATA, dateiname)
    with open(pfad, "w", encoding="utf-8") as f:
        f.write("/* automatisch erzeugt von tools/build_data.py - nicht von Hand aendern */\n")
        f.write("window.%s = " % name)
        json.dump(objekt, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("geschrieben:", pfad, "(%d KB)" % (os.path.getsize(pfad) // 1024))


def anzeigename_kreis(gen, bez):
    if bez.startswith("Kreisfreie"):
        return "Stadt " + gen
    if bez == "Landkreis" and not gen.lower().endswith("kreis"):
        return "Landkreis " + gen
    return gen


def kurzname_gemeinde(gen):
    return gen.split("/")[0].strip()      # "Tambach-Dietharz/Thür. Wald" -> "Tambach-Dietharz"


# ----------------------------------------------------------------- Schritt 1: Grenzen
def baue_grenzen(bkg_dir):
    kreise_roh = [f for f in features(json.load(open(os.path.join(bkg_dir, "kreise.geo.json"), encoding="utf-8")))
                  if f["properties"].get("GF") == 4]
    gem_roh = [f for f in features(json.load(open(os.path.join(bkg_dir, "gemeinden.geo.json"), encoding="utf-8")))
               if f["properties"].get("GF") == 4 and str(f["properties"]["AGS"]).startswith(GOTHA_AGS)]
    print("Kreise (Land):", len(kreise_roh), " Gemeinden Gotha (Stand 2021):", len(gem_roh))

    # --- Gemeinden (UTM-Meter)
    gem = {}
    for f in gem_roh:
        p = f["properties"]
        gem[p["AGS"]] = {"ags": p["AGS"], "name": kurzname_gemeinde(p["GEN"]), "art": "Stadt" if p["BEZ"] == "Stadt" else "Gemeinde",
                         "geom": shape(f["geometry"]).buffer(0)}
    for quelle, ziel in KORREKTUREN["gemeinde_zusammenlegen"]:
        if quelle in gem and ziel in gem:
            print("  Korrektur: %s -> %s" % (gem[quelle]["name"], gem[ziel]["name"]))
            gem[ziel]["geom"] = unary_union([gem[ziel]["geom"], gem[quelle]["geom"]])
            del gem[quelle]

    # --- Kreise
    kreise = {}
    for f in kreise_roh:
        p = f["properties"]
        kreise[p["AGS"]] = {"ags": p["AGS"], "gen": p["GEN"], "bez": p["BEZ"], "geom": shape(f["geometry"]).buffer(0)}
    for quelle, ziel in KORREKTUREN["kreis_zusammenlegen"]:
        if quelle in kreise and ziel in kreise:
            print("  Korrektur: %s -> %s" % (kreise[quelle]["gen"], kreise[ziel]["gen"]))
            kreise[ziel]["geom"] = unary_union([kreise[ziel]["geom"], kreise[quelle]["geom"]])
            del kreise[quelle]

    gotha = kreise[GOTHA_AGS]["geom"]
    kreis_aus_gemeinden = unary_union([g["geom"] for g in gem.values()])
    abw = gotha.symmetric_difference(kreis_aus_gemeinden).area / gotha.area
    print("  Kontrolle: Kreisflaeche %.1f km2, Summe Gemeinden %.1f km2, Abweichung %.4f %%"
          % (gotha.area / 1e6, kreis_aus_gemeinden.area / 1e6, abw * 100))
    assert abw < 0.002, "Gemeinden passen nicht zum Kreis"

    # --- Nachbarn
    nachbarn = {}
    for ags, k in kreise.items():
        if ags == GOTHA_AGS:
            continue
        gemeinsam = k["geom"].intersection(gotha.boundary)
        if gemeinsam.length >= NACHBAR_MIN_GRENZE_M:
            nachbarn[ags] = (k, gemeinsam)
    print("Nachbarn:", sorted(anzeigename_kreis(k["gen"], k["bez"]) for k, _ in nachbarn.values()))

    # --- Vereinfachen als zusammenhaengende Flaechenmenge (gemeinsame Grenzen bleiben identisch)
    ids = list(gem.keys()) + ["K" + a for a in nachbarn]
    geoms = [gem[a]["geom"] for a in gem] + [nachbarn[a][0]["geom"] for a in nachbarn]
    ok = shapely.coverage_is_valid(np.array(geoms, dtype=object))
    print("Flaechenmenge gueltig:", bool(np.all(ok)))
    einfach = shapely.coverage_simplify(np.array(geoms, dtype=object), TOL_GEMEINDEN_M)
    einfach = dict(zip(ids, einfach))

    # --- Farbindex (max. 6 Farben, Nachbarn bekommen verschiedene Farben)
    nachb = {a: set() for a in gem}
    for a in gem:
        for b in gem:
            if a < b and gem[a]["geom"].buffer(5).intersects(gem[b]["geom"]):
                nachb[a].add(b)
                nachb[b].add(a)
    farbe = {}
    for a in sorted(gem, key=lambda x: -len(nachb[x])):
        belegt = {farbe[b] for b in nachb[a] if b in farbe}
        farbe[a] = next(i for i in range(12) if i not in belegt)
    print("Gemeinde-Farben benutzt:", max(farbe.values()) + 1)

    gotha_c = gotha.centroid
    kreis_geom = unary_union([einfach[a] for a in gem])
    if kreis_geom.geom_type != "Polygon":
        kreis_geom = max(kreis_geom.geoms, key=lambda g: g.area)
    kreis_geom = Polygon(kreis_geom.exterior)           # ohne Loecher

    out_gem = []
    for a, g in sorted(gem.items(), key=lambda kv: kv[1]["name"]):
        e = einfach[a]
        out_gem.append({"type": "Feature", "geometry": geojson_geom(wgs(e)),
                        "properties": {"id": a, "n": g["name"], "art": g["art"], "f": farbe[a],
                                       "km2": round(g["geom"].area / 1e6, 1), "l": pol_label(e)}})

    out_nb = []
    for a, (k, gemeinsam) in sorted(nachbarn.items(), key=lambda kv: kv[1][0]["gen"]):
        e = einfach["K" + a]
        c = gemeinsam.centroid
        out_nb.append({"type": "Feature", "geometry": geojson_geom(wgs(e)),
                       "properties": {"id": a, "n": anzeigename_kreis(k["gen"], k["bez"]),
                                      "r": richtung(c.x - gotha_c.x, c.y - gotha_c.y), "l": pol_label(e)}})

    kreis = {"type": "Feature", "geometry": geojson_geom(wgs(kreis_geom)),
             "properties": {"id": GOTHA_AGS, "n": "Landkreis Gotha", "km2": round(gotha.area / 1e6, 1),
                            "anzahl_gemeinden": len(gem), "l": pol_label(kreis_geom)}}
    b = wgs(kreis_geom).bounds
    daten = {"kreis": kreis, "nachbarn": {"type": "FeatureCollection", "features": out_nb},
             "gemeinden": {"type": "FeatureCollection", "features": out_gem},
             "grenzen": [round(b[1], 4), round(b[0], 4), round(b[3], 4), round(b[2], 4)],
             "quelle": "Verwaltungsgrenzen © GeoBasis-DE / BKG (Stand 01.01.2021, angepasst: Eisenach im Wartburgkreis, "
                       "Herrenhof in Georgenthal), Datenlizenz Deutschland – Namensnennung – Version 2.0"}
    schreibe_js("GOTHA_GRENZEN", daten, "grenzen.js")
    # fuer den OSM-Schritt merken (unvereinfachte Gemeinden fuer saubere Zuordnung)
    with open(os.path.join("/tmp", "gotha_gemeinden_utm.json"), "w") as f:
        json.dump({a: {"n": g["name"], "art": g["art"], "wkt": g["geom"].wkt} for a, g in gem.items()}, f)
    with open(os.path.join("/tmp", "gotha_kreis_utm.wkt"), "w") as f:
        f.write(gotha.wkt)
    print("\nNachbarkreise und Richtung:")
    for f_ in out_nb:
        print("   %-34s %s" % (f_["properties"]["n"], f_["properties"]["r"]))
    print("\nGemeinden (%d):" % len(out_gem))
    for f_ in out_gem:
        print("   %-18s %-9s %5.1f km2" % (f_["properties"]["n"], f_["properties"]["art"], f_["properties"]["km2"]))


# ----------------------------------------------------------------- Schritt 2: OSM
def lade_gemeinden_utm():
    from shapely import wkt
    pfad = "/tmp/gotha_gemeinden_utm.json"
    if not os.path.exists(pfad):
        sys.exit("Bitte zuerst den Schritt 'grenzen' ausfuehren.")
    d = json.load(open(pfad))
    gem = {a: {"n": v["n"], "art": v["art"], "geom": wkt.loads(v["wkt"])} for a, v in d.items()}
    kreis = wkt.loads(open("/tmp/gotha_kreis_utm.wkt").read())
    return gem, kreis


def geom_aus_punkten(punkte):
    return [(p["lon"], p["lat"]) for p in punkte]


def norm_ref(ref):
    """'A 4;E 40' -> ('A','A 4'), 'B 88' -> ('B','B 88')"""
    treffer = []
    for teil in re.split(r"[;,]", ref or ""):
        m = re.match(r"^\s*([AB])\s?(\d+)\s*$", teil)
        if m:
            treffer.append((m.group(1), "%s %s" % (m.group(1), m.group(2))))
    if not treffer:
        return None
    treffer.sort(key=lambda t: t[0])      # A vor B
    return treffer[0]


def zu_utm_linie(punkte):
    xs, ys = TO_UTM.transform([p[0] for p in punkte], [p[1] for p in punkte])
    return LineString(list(zip(xs, ys)))


def linien_zu_liste(geom_utm, tol):
    """Geometrie (Linien) -> Liste von [[lon,lat],...] vereinfacht und gerundet."""
    teile = []
    if geom_utm.is_empty:
        return teile
    if geom_utm.geom_type == "LineString":
        teile = [geom_utm]
    elif geom_utm.geom_type in ("MultiLineString", "GeometryCollection"):
        teile = [g for g in geom_utm.geoms if g.geom_type == "LineString"]
    out = []
    for t in teile:
        if t.length < 60:
            continue
        t = t.simplify(tol, preserve_topology=False)
        lon, lat = TO_WGS.transform(*zip(*t.coords))
        out.append([[round(x, 5), round(y, 5)] for x, y in zip(lon, lat)])
    return out


def verbinde(linien):
    """Mehrere Linienstuecke zu moeglichst langen Linien verbinden."""
    u = unary_union(linien)
    return linemerge(u) if u.geom_type == "MultiLineString" else u


def polygon_aus_relation(el):
    """Baut aus den Mitgliedern einer Multipolygon-Relation ein Polygon (UTM)."""
    aussen, innen = [], []
    for m in el.get("members", []):
        if m.get("type") != "way" or not m.get("geometry"):
            continue
        pts = [(p["lon"], p["lat"]) for p in m["geometry"]]
        if len(pts) < 2:
            continue
        (innen if m.get("role") == "inner" else aussen).append(zu_utm_linie(pts))
    if not aussen:
        return None
    def ringe(linien):
        vereint = unary_union(linien)
        verbunden = linemerge(vereint) if vereint.geom_type == "MultiLineString" else vereint
        return list(polygonize(verbunden))
    a = unary_union(ringe(aussen)) if ringe(aussen) else None
    if a is None or a.is_empty:
        return None
    if innen:
        i = ringe(innen)
        if i:
            a = a.difference(unary_union(i))
    return a


def baue_osm(osm_pfad):
    gem, kreis = lade_gemeinden_utm()
    kreis_clip = kreis.buffer(150)
    daten = json.load(open(osm_pfad, encoding="utf-8"))
    el = daten["elements"]
    stand = (daten.get("osm3s") or {}).get("timestamp_osm_base", "unbekannt")
    print("OSM-Elemente:", len(el), " Datenstand:", stand)
    zaehler = defaultdict(int)
    for e in el:
        zaehler[e["type"]] += 1
    print("  ", dict(zaehler))

    # --- Gemeindenamen aus OSM zur Gegenkontrolle
    admin8 = sorted({e["tags"].get("name", "?") for e in el if e["type"] == "relation"
                     and e.get("tags", {}).get("boundary") == "administrative" and e["tags"].get("admin_level") == "8"})

    def in_gemeinde(x, y):
        p = Point(x, y)
        for a, g in gem.items():
            if g["geom"].contains(p):
                return a
        return None

    # --- Orte
    orte, gesehen = [], []
    roh_orte = [e for e in el if e["type"] == "node" and e.get("tags", {}).get("place") in ("city", "town", "village", "hamlet")
                and e["tags"].get("name")]
    for e in roh_orte:
        t = e["tags"]
        x, y = TO_UTM.transform(e["lon"], e["lat"])
        a = in_gemeinde(x, y)
        innen = a is not None
        if any(abs(x - gx) < 300 and abs(y - gy) < 300 and gn == t["name"] for gn, gx, gy in gesehen):
            continue
        gesehen.append((t["name"], x, y))
        pop = None
        try:
            pop = int(re.sub(r"\D", "", t.get("population", "")) or 0) or None
        except ValueError:
            pass
        if not innen:
            if t["place"] not in ("city", "town"):
                continue
            art = "nachbarstadt"
        elif t["place"] in ("city", "town") and gem[a]["art"] == "Stadt":
            art = "stadt"
        elif t["place"] == "hamlet":
            art = "weiler"
        else:
            art = "dorf"
        o = {"n": t["name"], "t": art, "p": [round(e["lon"], 5), round(e["lat"], 5)]}
        if a:
            o["g"] = a
        if pop:
            o["e"] = pop
        orte.append(o)
    # Staedte aus der Verwaltung, die in OSM fehlen oder anders gefuehrt sind
    vorhanden = {o["n"] for o in orte if o["t"] == "stadt"}
    for a, g in gem.items():
        if g["art"] == "Stadt" and g["n"] not in vorhanden:
            c = g["geom"].representative_point()
            lon, lat = TO_WGS.transform(c.x, c.y)
            print("  HINWEIS: Stadt %s nicht als town/city in OSM gefunden -> Punkt aus Gemeindeflaeche" % g["n"])
            orte = [o for o in orte if not (o["n"] == g["n"] and o["t"] in ("dorf", "weiler"))]
            orte.append({"n": g["n"], "t": "stadt", "p": [round(lon, 5), round(lat, 5)], "g": a})
    # Nachbarstaedte: nur eine Auswahl (siehe NACHBARSTAEDTE), Namenszusaetze wie "/Thueringen" weglassen
    nb = []
    for o in orte:
        if o["t"] != "nachbarstadt":
            continue
        o["n"] = o["n"].split("/")[0].strip()
        if o["n"] in NACHBARSTAEDTE:
            nb.append(o)
    fehlen = [n for n in NACHBARSTAEDTE if n not in {o["n"] for o in nb}]
    if fehlen:
        print("  HINWEIS: Nachbarstaedte nicht in den Daten gefunden:", fehlen)
    orte = [o for o in orte if o["t"] != "nachbarstadt"] + nb
    orte.sort(key=lambda o: (o["t"], o["n"]))

    # --- Berge: nur die hoechsten, nicht zu dicht beieinander
    berge_roh = []
    for e in el:
        if e["type"] == "node" and e.get("tags", {}).get("natural") == "peak" and e["tags"].get("name"):
            name = e["tags"]["name"]
            if any(w in name.lower() for w in BERGE_AUSSCHLUSS):
                continue
            ele = re.sub(r"[^\d.,]", "", e["tags"].get("ele", "")).replace(",", ".")
            try:
                h = int(round(float(ele)))
            except ValueError:
                continue
            x, y = TO_UTM.transform(e["lon"], e["lat"])
            if h < BERGE_MIN_HOEHE or not kreis.buffer(300).contains(Point(x, y)):
                continue
            berge_roh.append((h, name, e["lon"], e["lat"], x, y))
    berge_roh.sort(key=lambda b: -b[0])
    berge, behalten = [], []
    for h, name, lon, lat, x, y in berge_roh:
        if len(berge) >= BERGE_MAX:
            break
        if any(math.hypot(x - bx, y - by) < BERGE_MIN_ABSTAND_M for bx, by in behalten):
            continue
        behalten.append((x, y))
        berge.append({"n": name, "h": h, "p": [round(lon, 5), round(lat, 5)]})

    # --- Strassen
    strassen_roh = defaultdict(list)
    einbahn_anteil = defaultdict(lambda: [0.0, 0.0])      # [Laenge Einbahn-Fahrbahnen, Gesamtlaenge]
    for e in el:
        if e["type"] == "way" and e.get("tags", {}).get("highway") and e.get("geometry"):
            r = norm_ref(e["tags"].get("ref"))
            if not r:
                continue
            linie = zu_utm_linie(geom_aus_punkten(e["geometry"]))
            strassen_roh[r].append(linie)
            einbahn_anteil[r][1] += linie.length
            if e["tags"].get("oneway") in ("yes", "true", "1"):
                einbahn_anteil[r][0] += linie.length
    strassen = []
    for (klasse, ref), linien in sorted(strassen_roh.items(), key=lambda kv: (kv[0][0], int(kv[0][1].split()[1]))):
        vereint = verbinde(linien)
        beschnitten = vereint.intersection(kreis_clip)
        teile = linien_zu_liste(beschnitten, TOL_LINIEN_M)
        if teile:
            ein, ges = einbahn_anteil[(klasse, ref)]
            faktor = 1.0 - 0.5 * (ein / ges if ges else 0)      # getrennte Fahrbahnen nur einmal zaehlen
            laenge = round(vereint.intersection(kreis).length * faktor / 1000, 1)
            if laenge >= 1.5:
                strassen.append({"r": ref, "k": klasse, "c": teile, "km": laenge})

    # --- Gewaesser (Linien)
    wasser_roh = defaultdict(lambda: {"linien": [], "arten": defaultdict(int)})
    for e in el:
        t = e.get("tags", {})
        if e["type"] == "way" and t.get("waterway") in ("river", "canal", "stream") and t.get("name") and e.get("geometry"):
            w = wasser_roh[t["name"]]
            w["linien"].append(zu_utm_linie(geom_aus_punkten(e["geometry"])))
            w["arten"][t["waterway"]] += 1
    wasser = []
    for name, w in wasser_roh.items():
        vereint = verbinde(w["linien"])
        beschnitten = vereint.intersection(kreis_clip)
        km = beschnitten.length / 1000
        arten = w["arten"]
        if "graben" in name.lower():
            continue                                    # Gräben sind für Kinder keine "größeren Gewässer"
        if "kanal" in name.lower():
            art = "kanal"
        elif arten.get("river"):
            art = "fluss"
        else:
            art = "bach"
        mindest = BACH_MIN_KM if art == "bach" else FLUSS_MIN_KM
        teile = linien_zu_liste(beschnitten, TOL_LINIEN_M)
        if teile and km >= mindest:
            wasser.append({"n": name, "k": art, "c": teile, "km": round(km, 1)})
    wasser.sort(key=lambda w: -w["km"])

    # --- Gewaesser (Flaechen)
    seen_roh = []
    for e in el:
        t = e.get("tags", {})
        if not t.get("name"):
            continue
        if not (t.get("natural") == "water" or t.get("landuse") == "reservoir"):
            continue
        poly = None
        if e["type"] == "way" and e.get("geometry") and len(e["geometry"]) >= 4:
            pts = geom_aus_punkten(e["geometry"])
            if pts[0] == pts[-1]:
                poly = Polygon([TO_UTM.transform(*p) for p in pts]).buffer(0)
        elif e["type"] == "relation":
            poly = polygon_aus_relation(e)
        if poly is None or poly.is_empty:
            continue
        sorte = t.get("water") or ("reservoir" if t.get("landuse") == "reservoir" else "")
        seen_roh.append((t["name"], sorte, poly))
    seen = []
    for name, sorte, poly in seen_roh:
        poly = poly.intersection(kreis_clip)
        if poly.is_empty:
            continue
        ha = poly.area / 1e4
        if ha < SEE_MIN_HA:
            continue
        poly = poly.simplify(TOL_LINIEN_M * 0.7)
        if poly.geom_type == "GeometryCollection":
            poly = unary_union([g for g in poly.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
        if poly.is_empty:
            continue
        lower = name.lower()
        if "teich" in lower:
            art = "teich"
        elif "stausee" in lower:
            art = "stausee"
        elif any(w in lower for w in ("talsperre", "vorsperre", "speicher")) or sorte == "reservoir":
            art = "talsperre"
        elif sorte in ("pond", "basin"):
            art = "teich"
        else:
            art = "see"
        seen.append({"n": name, "k": art, "ha": round(ha, 1), "a": pol_label(poly),
                     "f": geojson_geom(wgs(poly))})
    seen.sort(key=lambda s: -s["ha"])

    ergebnis = {"stand": stand[:10], "quelle": "Straßen, Gewässer, Orte und Berge: © OpenStreetMap-Mitwirkende (ODbL)",
                "orte": orte, "berge": berge, "strassen": strassen, "wasser": wasser, "seen": seen}
    schreibe_js("GOTHA_OSM", ergebnis, "osm.js")

    print("\nOrte: %d (Stadt %d, Dorf %d, Weiler %d, Nachbarstadt %d)" % (
        len(orte), *[sum(1 for o in orte if o["t"] == k) for k in ("stadt", "dorf", "weiler", "nachbarstadt")]))
    print("Berge: %d, hoechster: %s" % (len(berge), berge[0] if berge else "-"))
    print("Strassen:", [(s["r"], s["km"]) for s in strassen])
    print("Gewaesser (Linien):", [(w["n"], w["k"], w["km"]) for w in wasser][:30], "...", len(wasser))
    print("Gewaesser (Flaechen):", [(s["n"], s["k"], s["ha"]) for s in seen])
    print("\nGemeinden laut OSM (admin_level 8):", len(admin8))
    mein = sorted(g["n"] for g in gem.values())
    print("  nur in OSM :", [n for n in admin8 if n not in mein])
    print("  nur in BKG :", [n for n in mein if n not in admin8])


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    g = sp.add_parser("grenzen")
    g.add_argument("--bkg-dir", required=True)
    o = sp.add_parser("osm")
    o.add_argument("--osm", required=True)
    for q in (g, o):
        q.add_argument("--out", default=DATA, help="Ausgabeordner (Standard: data/)")
    a = ap.parse_args()
    DATA = a.out
    if a.cmd == "grenzen":
        baue_grenzen(a.bkg_dir)
    else:
        baue_osm(a.osm)
