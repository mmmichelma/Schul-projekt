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

### Förderbänder & Logistik

* **Echte Plätze**: Jede Banane braucht Platz auf dem Band. Wenn es vorne voll ist, staut es sich zurück.
* **Seitliches Einfädeln**: Ein Band, das von der Seite auf ein anderes trifft, schiebt seine Bananen
  in der Mitte ein, aber nur in eine Lücke. Das Hauptband hat Vorfahrt.
* **Förderbandteiler**: Ausgänge vorne, rechts und links lassen sich einzeln an- und abschalten.
  Modus *Gleichmäßig* (reihum) oder *Vorne zuerst* (Überlauf zur Seite).
* **Förderbandverbinder**: führt bis zu drei Bänder zusammen, *fair abwechselnd* oder *hinten hat Vorfahrt*.
* **Filter**: mehrere Zustände wählbar. Die gehen geradeaus, alles andere zur Seite.
* **Kreuzung**: Zwei Bänder kreuzen sich, ohne sich zu vermischen.
* **Tunnel**: Ein Band läuft bis zu 6 Felder unter anderen Gebäuden durch.
* Teiler, Verbinder, Filter und Kreuzung gibt es wie die Bänder in 5 Stufen (Standard bis Hyper).
  Man kann sie **direkt auf ein bestehendes Band setzen**, und die Bananen darauf bleiben erhalten.

### Online mit Freunden

Mit einem Konto (Name + Passwort, keine E-Mail) wird deine Fabrik online gespeichert.
Freunde fügst du über ihren Namen hinzu. Ist ein Freund online, kannst du **seiner Fabrik beitreten**
und mitbauen: gemeinsames Geld, aber jeder hat eigene Hände zum Schälen. Dazu gibt es Chat, die Mauszeiger
der anderen und eine Bestenliste. Server ist ein Supabase-Projekt (Datenbank + Realtime).

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

## Android-App (APK)

```bash
cd banana-mountain
npm run apk        # baut die Solo-Version und daraus die APK -> banana-mountain.apk
```
Dafür braucht man das Android SDK (`ANDROID_HOME`), Java 17+ und Gradle.
Die App enthält das komplette Spiel (Solo-Modus) und läuft ohne Internet. Der Spielstand bleibt auf dem Handy.

**Installieren:** Die APK aufs Handy kopieren, antippen und „Installation aus unbekannten Quellen“ erlauben.

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
