# 🌾 Heuhaufen-Helden

Ein Such- und Sammelspiel für den Browser – mit **Online-Modus**.
Finde die versteckten Gegenstände, bevor die Zeit abläuft: die Nadel im Heuhaufen,
Muscheln am Strand, Pilze im Laub, Goldbonbons, UFOs im Weltall und Diamanten im Goldberg.

## Starten

Man braucht [Node.js](https://nodejs.org) (Version 18 oder neuer).

```bash
cd sammelspiel
npm install      # nur beim ersten Mal
npm start
```

Danach im Browser **http://localhost:3000** öffnen.
Der Server zeigt beim Start auch eine Adresse wie `http://192.168.0.23:3000` an –
die können Freunde **im gleichen WLAN** öffnen und online mitspielen.

## So funktioniert das Spiel

| Was | Wie |
| --- | --- |
| **Suchen** | Klicke die gesuchten Gegenstände an. Daneben klicken kostet 2 Sekunden. |
| **Level** | Jede geschaffte Runde = nächstes Level: mehr Gegenstände, mehr Ablenkung, kleinere Ziele. |
| **Münzen** | Für jeden Fund, für geschaffte Runden (mit Zeitbonus) und für Erfolge. |
| **Neue Welten** | Level 3 in der vorherigen Welt erreichen + Münzen bezahlen → 6 Welten insgesamt. |
| **Shop** | Lupe 🔍, Adlerauge 🦅, Sanduhr ⏳, Glücksklee 🍀, Goldfinger 🤑 und Hilfsmittel (Magnet 🧲, Zeitstopp ⏸️). |
| **Album** | In vielen Runden ist ein Sammelgegenstand versteckt (gewöhnlich bis legendär) – 30 Stück insgesamt. |
| **Erfolge** | 17 Erfolge mit Bonus-Münzen. |

Tasten im Spiel: **M** = Magnet, **Z** = Zeitstopp, **L** = Lupe an/aus, **Esc** = Beenden.

### Online-Modus

* **Schnelles Spiel** – landet in einem öffentlichen Raum mit anderen.
* **Privaten Raum erstellen** – du bekommst einen 4-stelligen Code für deine Freunde.
* Alle sehen **dasselbe Bild**. Wer einen Gegenstand zuerst anklickt, bekommt den Punkt
  (Sammelgegenstand = 3 Punkte). Fehlklick = 1,2 Sekunden gesperrt.
* Gewinner bekommen 50 Bonus-Münzen. Es gibt eine Bestenliste (wird in `data/bestenliste.json` gespeichert).

Der Spielstand (Münzen, Album, …) wird im Browser gespeichert (`localStorage`).

## Aufbau

```
sammelspiel/
├── server.js          Webserver + Online-Modus (WebSockets, Räume, Bestenliste)
├── public/
│   ├── index.html     Seitenaufbau
│   ├── style.css      Aussehen
│   ├── shared.js      Spielregeln, Welten, Zufallsgenerator (Browser UND Server)
│   ├── worlds.js      Zeichnen der 6 Welten
│   └── game.js        Spiel, Shop, Album, Erfolge, Online-Client
└── test/              Tests (npm test)
```

**Trick beim Online-Modus:** Der Server schickt nur eine Zufallszahl (*Seed*).
Weil `shared.js` einen eigenen Zufallsgenerator mit Seed benutzt, berechnen alle
Computer daraus genau dieselben Positionen. Der Server prüft dann bei jedem Klick,
ob der Gegenstand noch frei ist und der Klick wirklich in der Nähe war.
