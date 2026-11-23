#!/usr/bin/env python3
"""Packt die ganze App in EINE html-Datei (zum Verschicken, Beamer-Rechner, USB-Stick).

    python3 tools/einzeldatei_bauen.py            ->  gotha-karte-einzeldatei.html
"""
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
    text = lies(m.group(1))
    text = re.sub(r"url\((?:images/)[^)]*\)", "url(data:,)", text)      # ungenutzte Leaflet-Bilder
    return "<style>\n" + text + "\n</style>"


def js(m):
    pfad = m.group(1)
    if not os.path.exists(os.path.join(WURZEL, pfad)):
        return "<!-- %s nicht vorhanden -->" % pfad
    return "<script>\n" + lies(pfad).replace("</script", "<\\/script") + "\n</script>"


html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
with open(ziel, "w", encoding="utf-8") as f:
    f.write(html)
print("geschrieben:", ziel, "(%d KB)" % (os.path.getsize(ziel) // 1024))
