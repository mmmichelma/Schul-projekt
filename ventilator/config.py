"""
config.py - Alle Konstanten des personenverfolgenden Ventilators an einer Stelle.

Die Werte sind Startwerte. Sie muessen im Raum noch feinabgestimmt werden
(siehe Programmier-Uebersicht, Schritt 7).
"""

# ---------------------------------------------------------------------------
# Pins (BCM-Nummerierung)
# ---------------------------------------------------------------------------
PIN_TRIG = 23          # HC-SR04 Trigger
PIN_ECHO = 24          # HC-SR04 Echo  -> NUR ueber Spannungsteiler (5 V -> 3,3 V)!
PIN_SERVO = 18         # PWM-Signal MG996R (GPIO18 kann Hardware-PWM)
PIN_RELAY = 17         # Relaismodul IN
PIN_LED = 27           # Status-LED (mit Vorwiderstand)

# Viele Relaismodule schalten bei LOW ("active low").
# Laeuft der Ventilator genau verkehrt herum -> auf False setzen.
RELAY_ACTIVE_HIGH = False

# ---------------------------------------------------------------------------
# Servo
# ---------------------------------------------------------------------------
ANGLE_MIN = 0.0        # Schwenkbereich in Grad (Muss: >= 90, Wunsch: >= 120)
ANGLE_MAX = 180.0      # an die Mechanik anpassen, damit nichts anschlaegt!
ANGLE_START = 90.0     # Startposition (Mitte)

SERVO_MIN_PULSE = 0.0005   # 0,5 ms  -> 0 Grad
SERVO_MAX_PULSE = 0.0025   # 2,5 ms  -> 180 Grad

SCAN_STEP = 5.0            # Schrittweite des Radar-Scans in Grad
SETTLE_TIME = 0.10         # Wartezeit nach Servo-Bewegung vor der Messung (s)
SERVO_SEC_PER_DEGREE = 0.003   # zusaetzliche Wartezeit pro Grad bei grossen Spruengen
SERVO_RELEASE_IN_TRACK = True  # Servo im TRACK-Zustand freigeben (gegen Zittern)

# Manueller Oszillier-Modus (--mode manual)
MANUAL_STEP = 2.0          # Grad pro Schritt
MANUAL_STEP_TIME = 0.04    # Sekunden pro Schritt

# ---------------------------------------------------------------------------
# Sensor / Erkennung
# ---------------------------------------------------------------------------
MAX_DISTANCE = 200.0       # Messbereich in cm (Muss: bis 2 m)
DETECT_DISTANCE = 150.0    # Schwelle "Person erkannt" in cm
MEDIAN_SAMPLES = 3         # Anzahl Messungen fuer den Median
SAMPLE_GAP = 0.06          # Abstand zwischen zwei Einzelmessungen (HC-SR04: >= 60 ms)
CONFIRM_COUNT = 2          # Erkennung erst nach 2 Treffern in Folge

# ---------------------------------------------------------------------------
# Zeiten
# ---------------------------------------------------------------------------
MEASURE_INTERVAL = 0.1     # Messintervall im TRACK/LOST-Zustand (s)
LOST_TIMEOUT = 5.0         # so lange ohne Treffer, dann Scan fortsetzen (s)
FAN_OFF_DELAY = 30.0       # Luefter aus nach laengerer Abwesenheit (s) (Kannkriterium)

# ---------------------------------------------------------------------------
# Status-LED
# ---------------------------------------------------------------------------
LED_BLINK_ON = 0.5         # Scannen = langsam blinken
LED_BLINK_OFF = 0.5

# ---------------------------------------------------------------------------
# Logdatei (Kannkriterium) - None = nur Konsole
# ---------------------------------------------------------------------------
LOG_FILE = None            # z. B. "/home/pi/ventilator/ventilator.log"
