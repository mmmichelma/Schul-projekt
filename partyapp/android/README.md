# Konfetti – Android-App

Die App ist eine schlanke WebView-Hülle um `../www/index.html`. Änderungen an den Spielen
werden also nur in `www/index.html` gemacht und landen beim nächsten Build automatisch in der App.

## APK installieren
`partyapp/Konfetti.apk` aufs Handy kopieren, antippen und „Installation aus unbekannten Quellen“ erlauben.

## Selbst bauen
Voraussetzungen: JDK 17+, Android SDK (Platform 34, Build-Tools 34).

```bash
cd partyapp/android
echo "sdk.dir=/pfad/zum/android-sdk" > local.properties   # oder ANDROID_HOME setzen
./gradlew assembleDebug
# Ergebnis: app/build/outputs/apk/debug/app-debug.apk
```

Alternativ den Ordner `partyapp/android` in Android Studio öffnen und auf ▶ klicken.
