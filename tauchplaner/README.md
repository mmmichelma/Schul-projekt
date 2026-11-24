# Tauchplaner (Android-App)

Tauchgangsplanung nach Bühlmann ZHL-16C mit Gradientenfaktoren (Luft & Nitrox).

**Fertige App:** `../Tauchplaner.apk` aufs Handy kopieren und installieren
(„Installation aus unbekannten Quellen“ erlauben).

## Funktionen
- **Planen:** Ort, Datum, Uhrzeit, Höhe (Bergsee), Salz-/Süßwasser, Tiefe, Grundzeit, Gas →
  Nullzeit, Deko-Stopps, Sicherheitsstopp, Auftauchzeit, MOD/ppO₂, CNS, Gasbedarf & Restdruck, Profil.
- **Tauchtag:** gespeicherte Tauchgänge, Oberflächenpausen, Reststickstoff wird automatisch berücksichtigt,
  benötigte Mindest-Oberflächenpause für den nächsten Tauchgang, Entsättigung, Flugverbot.
- **Tabellen:** Nullzeit-Tabelle, Wiederholungstabelle, MOD/EAD-Tabelle.
- **Einstellungen:** Gradientenfaktoren, Auf-/Abstiegsgeschwindigkeit, max. ppO₂, Sicherheitsstopp.

Die Logik steckt in `app/src/main/assets/deco.js`, die Oberfläche in `index.html`/`app.js`.

## Selbst bauen
`./gradlew assembleRelease` (Android SDK nötig, `local.properties` mit `sdk.dir=…`).

> Nur zur Ausbildung/Planung – ersetzt keinen Tauchcomputer und keine Tauchausbildung.
