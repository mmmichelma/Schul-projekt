"""
controller.py - Klasse TrackingController: zentrale Steuerlogik (Radar-Prinzip).

Zustandsautomat:

    SCAN  --(CONFIRM_COUNT Treffer in Folge)-->  TRACK
    TRACK --(kein Treffer)------------------->  LOST
    LOST  --(Treffer)------------------------>  TRACK
    LOST  --(LOST_TIMEOUT abgelaufen)-------->  SCAN  (ab letzter Position weiter)

    In jedem Zustand ausser TRACK: nach FAN_OFF_DELAY ohne Ziel -> Luefter aus.

step() ist genau ein Schleifendurchlauf und kann deshalb mit Attrappen
(Mock-Sensor usw.) ohne Hardware getestet werden (tests/test_controller.py).
"""

import logging
import time

import config

log = logging.getLogger(__name__)

SCAN = "SCAN"
TRACK = "TRACK"
LOST = "LOST"


class TrackingController:

    def __init__(self, sensor, servo, fan, status=None, cfg=config,
                 clock=time.monotonic, sleep=time.sleep):
        self.sensor = sensor
        self.servo = servo
        self.fan = fan
        self.status = status
        self.cfg = cfg
        self.clock = clock          # austauschbar fuer Tests (Fake-Uhr)
        self.sleep = sleep

        self.state = SCAN
        self.hits = 0               # Treffer in Folge (im SCAN)
        self.direction = 1          # +1 = Richtung ANGLE_MAX, -1 = Richtung ANGLE_MIN
        self.last_seen = None       # Zeitpunkt der letzten Erkennung
        self.last_distance = None
        self._running = False

    # ------------------------------------------------------------------
    # Hilfsfunktionen
    # ------------------------------------------------------------------
    def _set_state(self, new_state):
        if new_state != self.state:
            log.info("Zustand %s -> %s (Winkel %s, Distanz %s cm)",
                     self.state, new_state, self.servo.current_angle, self.last_distance)
            self.state = new_state

    def _show(self, what):
        if self.status is not None:
            getattr(self.status, what)()

    def next_scan_angle(self):
        """Naechster Winkel des Radar-Scans: hin und her zwischen Min und Max."""
        lo, hi = self.cfg.ANGLE_MIN, self.cfg.ANGLE_MAX
        current = self.servo.current_angle
        if current is None:
            return self.cfg.ANGLE_START
        nxt = current + self.direction * self.cfg.SCAN_STEP
        if nxt >= hi:
            nxt, self.direction = hi, -1
        elif nxt <= lo:
            nxt, self.direction = lo, 1
        return nxt

    # ------------------------------------------------------------------
    # Ein Schleifendurchlauf
    # ------------------------------------------------------------------
    def step(self):
        now = self.clock()
        dist = self.sensor.measure_median()
        self.last_distance = dist
        hit = dist is not None and dist < self.cfg.DETECT_DISTANCE

        if self.state == SCAN:
            self.hits = self.hits + 1 if hit else 0
            if self.hits >= self.cfg.CONFIRM_COUNT:
                # Person bestaetigt: Servo bleibt sofort stehen (kein Nachscannen)
                self.last_seen = now
                self.hits = 0
                self.fan.on()
                self._show("show_detected")
                self._set_state(TRACK)
                if self.cfg.SERVO_RELEASE_IN_TRACK:
                    self.servo.release()
            elif self.hits == 0:
                # nichts gesehen -> einen Scan-Schritt weiter
                self.servo.move_to(self.next_scan_angle())
            # bei 1 Treffer (noch nicht bestaetigt): stehen bleiben, nochmal messen

        elif self.state == TRACK:
            if hit:
                self.last_seen = now
            else:
                self._show("show_scanning")
                self._set_state(LOST)

        elif self.state == LOST:
            if hit:
                self.last_seen = now
                self.fan.on()
                self._show("show_detected")
                self._set_state(TRACK)
            elif now - self.last_seen > self.cfg.LOST_TIMEOUT:
                self.hits = 0
                self._show("show_scanning")
                self._set_state(SCAN)

        # Kannkriterium: Luefter aus nach laengerer Abwesenheit
        if (self.state != TRACK and self.fan.is_on and self.last_seen is not None
                and now - self.last_seen > self.cfg.FAN_OFF_DELAY):
            log.info("Seit %.0f s keine Person - Ventilator aus", now - self.last_seen)
            self.fan.off()

        return self.state

    # ------------------------------------------------------------------
    # Dauerbetrieb
    # ------------------------------------------------------------------
    def run(self):
        """Automatik-Modus: Endlosschleife, bis stop() aufgerufen wird."""
        self._running = True
        self.state = SCAN
        self._show("show_scanning")
        self.servo.move_to(self.cfg.ANGLE_START)
        log.info("Automatik-Modus gestartet")
        while self._running:
            self.step()
            # Im SCAN sorgt die Servo-Wartezeit fuer das Tempo,
            # in TRACK/LOST wird alle MEASURE_INTERVAL gemessen.
            if self.state != SCAN:
                self.sleep(self.cfg.MEASURE_INTERVAL)

    def run_manual(self):
        """Wunschkriterium: Oszillier-Modus. Servo pendelt starr, ohne Messung."""
        self._running = True
        self.fan.on()
        self._show("show_detected")
        lo, hi = self.cfg.ANGLE_MIN, self.cfg.ANGLE_MAX
        angle = self.cfg.ANGLE_START
        direction = 1
        log.info("Manueller Oszillier-Modus gestartet")
        while self._running:
            angle += direction * self.cfg.MANUAL_STEP
            if angle >= hi:
                angle, direction = hi, -1
            elif angle <= lo:
                angle, direction = lo, 1
            self.servo.move_to(angle, wait=False)
            self.sleep(self.cfg.MANUAL_STEP_TIME)

    def stop(self):
        self._running = False
