# Konfetti – Entwicklerkonzept für eine Partyspiel-App

> Eigene App-Idee, inspiriert vom Prinzip von Party-Apps wie Splash:
> **Das Smartphone ist der Spielleiter, im Mittelpunkt stehen die Menschen.**
> Name, Design, Fragen und Inhalte sind eigene Entwürfe.

Ein spielbarer Prototyp liegt in `index.html` (einfach im Browser öffnen).

---

## 1. Vision & Zielgruppe

| Punkt | Festlegung |
| --- | --- |
| Vision | Eine App ersetzt den Stapel Gesellschaftsspiele: Handy auspacken, Namen eintragen, losspielen. |
| Zielgruppe | 14–30 Jahre, Freundesgruppen, Schulklassen, Familien |
| Spieler | 3–20 Personen |
| Rundendauer | 2–10 Minuten pro Spiel |
| Plattformen | Web-App (PWA) → später iOS/Android über dieselbe Codebasis |
| Sprache | Deutsch zuerst, Texte so aufgebaut, dass Übersetzungen leicht möglich sind |

**Leitregeln für das Design**

1. Jedes Spiel ist in unter 30 Sekunden erklärt.
2. Maximal zwei Taps vom Startbildschirm bis zur ersten Karte.
3. Das Handy wird *weitergegeben* oder liegt *in der Mitte* – nie starrt einer allein darauf.
4. Inhalte sind altersgerecht in Stufen: *Familie*, *Party*, *Spicy (18+)*.

---

## 2. Spiele, Regeln und Spiellogik

### 2.1 Impostor (Bluff)
**Regel:** Alle Spieler sehen nacheinander ein geheimes Wort – außer der Impostor, der nur „Du bist der Impostor“ sieht. Reihum nennt jeder *ein* Hinweiswort. Danach wird diskutiert und abgestimmt. Wird der Impostor gefunden, darf er noch das Wort raten; rät er richtig, gewinnt er trotzdem.

**Logik:**
```
wort      = zufall(kategorie.woerter)
impostor  = zufall(spieler)            // bei >7 Spielern optional 2 Impostor
startSpieler = zufall(spieler)
für jeden Spieler: Karte verdeckt → Tap zum Aufdecken → Tap zum Verdecken → weitergeben
Phase "Hinweise" → Phase "Abstimmung" → Auflösung
```

### 2.2 Geheimer Ort (Spion-Variante)
Alle außer dem Spion kennen einen Ort (z. B. „Krankenhaus“) und bekommen eine Rolle (Ärztin, Patient …). Spieler stellen sich gegenseitig Fragen. Timer 6 Minuten. Der Spion gewinnt, wenn er unentdeckt bleibt oder den Ort errät.

### 2.3 Werwölfe (vereinfachte Version)
Rollen: Werwolf, Dorfbewohner, Seherin, Hexe. Die App verteilt verdeckt die Rollen und führt als Erzähler durch Nacht/Tag (Sprachausgabe optional). Rollenzahl: `werwoelfe = max(1, floor(spieler / 4))`.

### 2.4 Wer würde eher? (Diskussion)
Eine Aussage wird gezeigt („Wer würde eher im Urlaub den Pass vergessen?“). Auf „3-2-1“ zeigen alle gleichzeitig auf eine Person. Wer die meisten Finger abbekommt, erklärt sich.

### 2.5 Wahrheit oder Pflicht
Die App wählt einen Spieler (nie zweimal hintereinander), dieser wählt *Wahrheit* oder *Pflicht*. Nach 3× Wahrheit in Folge wird Pflicht erzwungen.

### 2.6 Skala 1–10
Eine Eigenschaft wird angezeigt („Wie chaotisch ist [Name]?“). Alle schätzen gleichzeitig mit den Fingern, die genannte Person nennt danach ihre eigene Zahl. Wer am nächsten dran ist, bekommt einen Punkt.

### 2.7 Die Bombe (Geschwindigkeit)
Eine Kategorie erscheint („Obstsorten“). Wer das Handy hält, nennt einen passenden Begriff und gibt weiter. Der Timer ist **geheim** (zufällig 15–45 Sekunden) und tickt schneller, je näher die Explosion ist. Wer das Handy beim Knall hält, bekommt einen Strafpunkt.

```
dauer = zufall(15, 45) Sekunden
tickIntervall = max(150ms, 1000ms * (restzeit / dauer))
```

### 2.8 Verbotene Wörter (Erklärspiel)
Zwei Teams. Ein Spieler erklärt einen Begriff, ohne die 4 verbotenen Wörter zu benutzen. 60 Sekunden pro Runde. *Richtig* = +1, *Überspringen* = 0, *Verbotenes Wort gesagt* = −1.

### 2.9 Pantomime / Wer bin ich?
Begriff wird angezeigt, Handy an die Stirn (Wer bin ich?) oder Begriff vorspielen (Pantomime). Kippen nach unten = richtig, nach oben = überspringen (Bewegungssensor `DeviceOrientationEvent`).

### 2.10 Schätzen
Schätzfrage („Wie viele Knochen hat ein Erwachsener?“ → 206). Jeder schätzt, wer am nächsten dran ist, gewinnt die Runde. Variante *Schätz-Impostor*: Einer bekommt eine leicht andere Frage.

### 2.11 Werkzeuge
| Werkzeug | Logik |
| --- | --- |
| Zufallsauswahl | `zufall(spieler)` mit Animation |
| Glücksrad | Segmente = Optionen, Drehwinkel `zufall(0, 360) + 5*360`, Ergebnis aus Endwinkel |
| Finger-Auswahl | Alle legen Finger aufs Display (Multi-Touch), nach 3 s Stillstand wird ein Touchpunkt gewählt |

### 2.12 Eigene neue Spielideen
| Spiel | Idee |
| --- | --- |
| **Emoji-Rätsel** | Die App zeigt Filmtitel/Songs als Emoji-Kette (🦁👑 → König der Löwen). Wer zuerst ruft, punktet. |
| **Zwei Wahrheiten, eine Lüge – Duell** | Jeder tippt heimlich 3 Aussagen ein, die App mischt sie, die Gruppe stimmt ab. |
| **Klassenzimmer-Quiz** | Lehrkraft-Modus: eigene Fragenpakete per QR-Code teilen – ideal für die Schule. |
| **Kettenreaktion** | Jeder sagt ein Wort, das mit dem letzten Buchstaben des vorherigen beginnt – Timer wird jede Runde kürzer. |
| **Mission geheim** | Jeder bekommt zu Partybeginn eine geheime Mini-Aufgabe („Bring jemanden dazu, ‚Banane‘ zu sagen“). Am Ende wird aufgelöst. |

---

## 3. Benutzeroberfläche

### 3.1 Screen-Ablauf
```
Start ──► Spieler eintragen ──► Spielauswahl (Kacheln nach Kategorie)
                                     │
                                     ▼
                              Spiel-Intro (Regeln in 3 Sätzen, Kategorie wählen)
                                     │
                                     ▼
                              Spielbildschirm ──► Ergebnis ──► Nochmal / Anderes Spiel
```

### 3.2 Gestaltung
- Große, farbige Kacheln mit Emoji pro Spiel, eine Farbe je Spielgruppe (Bluff = Lila, Fragen = Pink, Tempo = Orange).
- Karten mit großer Schrift (mind. 28 px), lesbar auf dem Tisch liegend.
- Ein-Hand-Bedienung: Hauptbuttons unten.
- Dunkelmodus als Standard (Partys sind abends).
- Haptisches Feedback (`navigator.vibrate`) bei Aufdecken, Explosion, Timerende.

---

## 4. Technische Architektur

| Schicht | Technologie | Begründung |
| --- | --- | --- |
| Frontend | HTML/CSS/JavaScript, später React + Capacitor | Läuft im Browser, später als App |
| Offline | Service Worker + `localStorage` / IndexedDB | Spielen ohne Internet |
| Backend | Supabase (PostgreSQL, Auth, Realtime) | Kostenlos für Start, Echtzeit eingebaut |
| Inhalte | JSON-Pakete, aus der Datenbank nachladbar | Neue Fragen ohne App-Update |
| Zahlungen | RevenueCat bzw. App-Store-/Play-Abrechnung | Abos plattformübergreifend |

### 4.1 Datenbankstruktur (PostgreSQL)

```sql
-- Nutzerkonten (optional, lokal spielbar ohne Konto)
create table profiles (
  id uuid primary key references auth.users,
  username text unique not null,
  is_plus boolean default false,
  plus_until timestamptz,
  created_at timestamptz default now()
);

-- Spiele
create table games (
  id text primary key,            -- 'impostor', 'bombe', ...
  name text not null,
  emoji text,
  group_name text,                -- 'bluff', 'fragen', 'tempo', 'online'
  min_players int default 3,
  max_players int default 20,
  online_capable boolean default false
);

-- Kategorien / Fragenpakete
create table packs (
  id uuid primary key default gen_random_uuid(),
  game_id text references games(id),
  name text not null,             -- 'Schule', 'Essen', 'Spicy'
  age_rating text check (age_rating in ('familie','party','18+')),
  is_premium boolean default false,
  language text default 'de'
);

-- Einzelne Inhalte (Wort, Frage, Aufgabe ...)
create table cards (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid references packs(id) on delete cascade,
  content text not null,          -- Hauptinhalt
  extra jsonb                     -- z. B. verbotene Wörter, Lösung beim Schätzen
);

-- Online-Räume
create table rooms (
  code text primary key,          -- 4-stelliger Code, z. B. 'K7QX'
  host_id uuid references profiles(id),
  game_id text references games(id),
  state jsonb default '{}',       -- aktueller Spielzustand
  status text default 'lobby',    -- lobby | playing | finished
  created_at timestamptz default now()
);

create table room_players (
  room_code text references rooms(code) on delete cascade,
  player_id uuid,
  nickname text not null,
  score int default 0,
  primary key (room_code, player_id)
);
```

Zugriffsschutz über **Row Level Security**: Premium-Karten nur lesbar, wenn `profiles.is_plus = true`; Raumdaten nur für Mitspieler.

### 4.2 Multiplayer-System

**Lokal (ein Handy):** komplette Logik im Gerät, Spielzustand als JavaScript-Objekt.

**Online (mehrere Handys):**
1. Host erstellt Raum → Server erzeugt Code `K7QX`.
2. Mitspieler geben Code ein oder scannen QR-Code → Eintrag in `room_players`.
3. Alle abonnieren den Realtime-Kanal `room:K7QX`.
4. **Der Host ist die Quelle der Wahrheit:** Nur er berechnet Zustandswechsel (Rollen verteilen, Timer, Auswertung) und schreibt sie in `rooms.state`.
5. Clients senden nur Aktionen (`{type: 'vote', target: 'Lea'}`), der Host verarbeitet sie.
6. Geheime Informationen (z. B. die Rolle) werden pro Spieler gesendet, damit niemand im Netzwerkverkehr spicken kann – besser noch über eine Server-Funktion (Edge Function), die die Rollen verteilt.
7. Verbindungsabbruch: Spieler kann mit gleichem Code + Namen wieder beitreten; Host-Wechsel, wenn der Host 30 s offline ist.

```
Client ──aktion──► Realtime-Kanal ──► Host
Host   ──neuer Zustand──► rooms.state ──► alle Clients rendern neu
```

---

## 5. Monetarisierung

| Einnahme | Umsetzung | Hinweis |
| --- | --- | --- |
| Kostenlose Basis | 6 Spiele, je 1–2 Kategorien | Genug, um begeistert zu sein |
| Konfetti Plus (Abo) | ca. 2,99 €/Monat oder 19,99 €/Jahr: alle Kategorien, keine Werbung, Online-Räume bis 20 Personen | 7 Tage kostenlos testen |
| Einzelpakete | z. B. „Abschlussfahrt-Paket“ 1,99 € | Für Nutzer ohne Abo |
| Werbung | Nur zwischen Spielen, nie mitten in einer Runde | Nicht für Minderjährige personalisiert |
| Kooperationen | Gesponserte Fragenpakete von Marken/Creators | Klar als Werbung gekennzeichnet |
| Events | Live-Spieleabende mit Creators | Später |

**Rechtliches (wichtig in Deutschland/EU):** DSGVO (keine Daten ohne Einwilligung, Konto freiwillig), Jugendschutz (18+-Inhalte nur mit Altersbestätigung, im Kinder-Modus ausgeblendet), Abo-Kündigung mit einem Klick (Kündigungsbutton-Pflicht).

---

## 6. Marketing

- Kurze Videos (TikTok/Instagram/YouTube Shorts) mit echten Spielmomenten: „Wir haben das Bombe-Spiel auf der Klassenfahrt gespielt …“
- Teilen-Funktion: Ergebniskarte nach dem Spiel als Bild („Lea wurde 5× gewählt als: Wer würde eher verschlafen?“).
- Einladung über Raumcode/QR = jeder Online-Mitspieler sieht die App.
- Schul-/Jugendgruppen-Paket für Lehrkräfte und Gruppenleitungen.

---

## 7. Roadmap

| Phase | Inhalt | Dauer |
| --- | --- | --- |
| 1 – Prototyp | Web-App mit 6 lokalen Spielen (siehe `index.html`) | ✅ erledigt |
| 2 – MVP | Mehr Inhalte (je Spiel ≥ 200 Karten), PWA/Offline, Altersstufen | 4 Wochen |
| 3 – Online | Supabase-Anbindung, Räume, Impostor & Wer würde eher online | 6 Wochen |
| 4 – App-Stores | Capacitor-Build, Abo, Werbung | 4 Wochen |
| 5 – Wachstum | Ein neues Spiel pro Monat, eigene Fragenpakete, Übersetzungen | laufend |

---

## 8. Erfolgsfaktoren (Kurzfassung)

1. **Keine Hürde:** kein Konto, kein Material, sofort spielbar.
2. **Abwechslung:** viele kurze Spiele statt eines langen.
3. **Wiederspielwert:** Inhalte kommen aus der Datenbank und wachsen ständig.
4. **Teilbare Momente:** Lachen, Bluffen, Überraschungen – perfekt für Social Media.
5. **Günstig erweiterbar:** Ein neues Fragenpaket kostet nur Text, keine Programmierung.
