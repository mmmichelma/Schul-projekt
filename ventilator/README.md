# Personenverfolgender Ventilator

Klasse 13 BG – Marc Michelmann, Yasin Gauhar – Betreuer: Herr Kinz
Raspberry Pi Zero 2 W, Python 3, gpiozero

## Dateien

| Datei | Inhalt |
|---|---|
| `config.py` | Alle Konstanten (Pins, Winkel, Schwellen, Zeiten) |
| `sensor.py` | `DistanceSensor` – HC-SR04, Median aus 3 Messungen, `None` bei keinem Echo |
| `servo.py` | `ServoAxis` – MG996R, Winkel begrenzt, `release()` gegen Zittern |
| `fan.py` | `FanController` – Relais, merkt Zustand, beim Beenden immer aus |
| `status.py` | `StatusDisplay` – LED: blinkt (Scan), Dauerlicht (Person), aus (Ruhe) |
| `controller.py` | `TrackingController` – Zustandsautomat SCAN → TRACK → LOST |
| `main.py` | Startpunkt, `--mode auto/manual`, `--log`, sauberes Beenden |
| `tests/` | Hardware-Tests je Bauteil + Unit-Test des Controllers (ohne Hardware) |
| `ventilator.service` | Autostart per systemd |

## Einrichtung auf dem Pi

```bash
sudo apt install python3-gpiozero pigpio python3-pigpio
sudo systemctl enable --now pigpiod      # gegen Servo-Zittern
# Ordner "ventilator" nach /home/pi/ventilator kopieren
cd /home/pi/ventilator
```

## Testen (Reihenfolge wie in der Übersicht)

```bash
python3 tests/test_sensor.py     # Hand in 20/50/100/150 cm halten
python3 tests/test_servo.py      # 0 → 90 → 180 → zurück (erst ohne Last!)
python3 tests/test_servo.py 45   # einzelnen Winkel anfahren (Kalibrierung)
python3 tests/test_fan.py        # Relais 3× an/aus – active low prüfen
python3 tests/test_status.py     # LED blinken / an / aus
python3 -m unittest discover -s tests -v   # Controller-Logik, geht auch am Laptop
```

Läuft der Ventilator bei „AUS“ und steht bei „AN“, dann in `config.py`
`RELAY_ACTIVE_HIGH` umstellen.

## Starten

```bash
python3 main.py                        # Automatik: Person verfolgen
python3 main.py --mode manual          # Oszillier-Modus ohne Messung
python3 main.py --log ventilator.log -v
```

Strg+C beendet sauber: Ventilator aus, Servo frei, GPIO freigegeben.

## Autostart (optional)

```bash
sudo cp ventilator.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ventilator
journalctl -u ventilator -f
```

## Zustandsautomat

| Zustand | Verhalten | LED |
|---|---|---|
| SCAN | Servo fährt in `SCAN_STEP`-Schritten hin und her, misst an jeder Position. 2 Treffer < 150 cm in Folge → TRACK | blinkt |
| TRACK | Servo bleibt stehen (wird freigegeben), Lüfter an, Messung alle 0,1 s. Kein Treffer → LOST | an |
| LOST | Person zurück → TRACK. Nach `LOST_TIMEOUT` (5 s) → SCAN ab letzter Position | blinkt |
| – | Nach `FAN_OFF_DELAY` (30 s) ohne Person: Lüfter aus | |

## Feinabstimmung im Raum

`ANGLE_MIN/MAX` an die Mechanik anpassen (nichts darf anschlagen),
`DETECT_DISTANCE` an den Raum, `SCAN_STEP`/`SETTLE_TIME` für Tempo vs. Genauigkeit.
