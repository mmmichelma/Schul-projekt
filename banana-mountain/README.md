# 🍌 Banana Mountain – Factory Simulator (3D)

Ein riesiger Berg aus **genau 1.000.000 Bananen**. Du baust ihn ab, verarbeitest die Bananen
und verkaufst sie, erst von Hand, dann mit einer immer größeren 3D-Fabrik.
Der Berg ist endlich. Es wachsen nie neue Bananen nach.

## Starten

Du brauchst [Node.js](https://nodejs.org) (Version 18 oder neuer).

```bash
cd banana-mountain
npm install        # einmalig
npm run dev        # Entwicklungsserver -> http://localhost:5173
```

Fertige Version bauen: `npm run build` (liegt dann in `dist/`, kann auf jeden Webserver).
Tests: `npm test`

## So spielst du

1. **Handarbeit**: Klick auf den Berg und du nimmst eine Banane. Im Schälbereich ziehst du die drei Schalenstreifen
   nach unten. Geschält bringt sie 3 $. In der **Werkstatt** kaufst du bessere Hände:
   geschickte Finger, Profi-Schältechnik (2 oder 3 Streifen pro Zug), mehr Hände, eine Bananenzange,
   einen Verkaufskorb, eine Nachschub-Rutsche und einen Schäl-Lehrling.
2. **Erste Automatisierung**: Stell einen Greifarm an den Rand des Berges (gelber Kreis = Arbeitsradius)
   und zieh Förderbänder vom orangen Ausgangspfeil bis zur Verkaufsstation.
3. **Fabrik**: Schälmaschine → Schneidemaschine → Backofen → Karamellisierer → Schokolade →
   Glasur → Veredelung → Verpackung → Premium (1 $ bis 500 $ pro Banane).
4. **Megafabrik**: schnellere Bänder (Standard bis Hyper), Teiler, Verbinder, Filter, Tunnel, Lager,
   Upgrades bis Level 10. Wo der Berg abgetragen ist, darfst du bauen.
5. **Ende**: Sind alle 1.000.000 Bananen verkauft, siehst du eine Abschlussstatistik.

### Steuerung
| Aktion | Maus / Tastatur | Touch |
| --- | --- | --- |
| Kamera verschieben | linke Maus ziehen, WASD | 1 Finger |
| Drehen / Zoomen | rechte Maus, Q/E, Mausrad | 2 Finger |
| Gebäude drehen | R | Knopf „Drehen“ |
| Förderband | B, dann ziehen | ziehen |
| Abriss (100 % Geld zurück) | X | „Abriss“ |
| Mehrere auswählen | Shift + ziehen | „Mehrere“ |
| Linie kopieren / einfügen | Strg+C / Strg+V | Knopf „Kopieren“ |
| Banane nehmen | Klick auf Berg / Leertaste | Tippen |

## Technik

* **React + TypeScript + Vite**, **three.js** für die 3D-Grafik (WebGL)
* `src/sim/` – **Simulation**, komplett ohne Grafik, feste Rate (20 Takte/s).
  Bänder haben echte Plätze, Bananen stauen sich, Maschinen haben Ein-/Ausgangspuffer.
  Die Regel *Haufen + Fabrik + Handbereich + verkauft = 1.000.000* wird in den Tests geprüft.
* `src/render/` – 3D: Bananenberg als Höhenfeld plus einzelne Bananen in 8×8-Chunks mit Detailstufen.
  Bänder und Bananen sind instanziert (wenige Draw-Calls). Alle Maschinenmodelle sind animiert.
* `src/storage/` – automatisches Speichern in **IndexedDB**, Export/Import als JSON-Datei.
  Wenn das Spiel geschlossen ist, läuft nichts weiter.
* Grafikqualität (Niedrig bis Ultra) und eine FPS-Anzeige stellst du im Menü ein.
