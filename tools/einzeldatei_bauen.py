#!/usr/bin/env python3
"""Packt die ganze App in EINE html-Datei (zum Verschicken, Beamer-Rechner, USB-Stick).

    python3 tools/einzeldatei_bauen.py            ->  gotha-karte-einzeldatei.html
"""
import base64
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ziel = sys.argv[1] if len(sys.argv) > 1 else os.path.join(WURZEL, "gotha-karte-einzeldatei.html")


def lies(rel):
    with open(os.path.join(WURZEL, rel), encoding="utf-8") as f:
        return f.read()


html = lies("index.html")


def css(m):
    pfad = m.group(1)
    text = lies(pfad)
    basis = os.path.dirname(pfad)

    def datei(u):
        rel = u.group(1).strip()
        if rel.startswith("data:"):
            return u.group(0)
        if rel.startswith("images/"):                       # ungenutzte Leaflet-Bilder
            return "url(data:,)"
        voll = os.path.normpath(os.path.join(WURZEL, basis, rel))
        endung = os.path.splitext(voll)[1].lower()
        mime = {".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png"}.get(endung)
        if not mime or not os.path.exists(voll):
            return "url(data:,)"
        with open(voll, "rb") as f:
            return "url(data:%s;base64,%s)" % (mime, base64.b64encode(f.read()).decode("ascii"))

    text = re.sub(r"url\(\s*[\"']?([^)\"']+)[\"']?\s*\)", datei, text)
    return "<style>\n" + text + "\n</style>"


def js(m):
    pfad = m.group(1)
    if not os.path.exists(os.path.join(WURZEL, pfad)):
        return "<!-- %s nicht vorhanden -->" % pfad
    return "<script>\n" + lies(pfad).replace("</script", "<\\/script") + "\n</script>"


# Die Einzeldatei wird per Doppelklick geoeffnet (file://): Manifest, App-Symbol und Service Worker gibt es dort nicht.
html = re.sub(r'<link rel="(?:manifest|apple-touch-icon)"[^>]*>\n?', '', html)
html = re.sub(r'<script src="js/pwa\.js"></script>\n?', '', html)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
with open(ziel, "w", encoding="utf-8") as f:
    f.write(html)
print("geschrieben:", ziel, "(%d KB)" % (os.path.getsize(ziel) // 1024))
