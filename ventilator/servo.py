"""
servo.py - Klasse ServoAxis: steuert den MG996R (horizontale Schwenkachse).

Gegen Servo-Zittern:
  * pigpio-Pin-Factory benutzen (sudo systemctl enable --now pigpiod),
    dann erzeugt der Pi sauberes Hardware-Timing.
  * Zusaetzlich kann der Servo mit release() freigegeben werden.
"""

import logging
import time

import config

log = logging.getLogger(__name__)


def _make_pin_factory():
    """Versucht pigpio zu nutzen, sonst Standard (Software-PWM, zittert evtl.)."""
    try:
        from gpiozero.pins.pigpio import PiGPIOFactory
        factory = PiGPIOFactory()
        log.info("Servo: pigpio-Pin-Factory aktiv")
        return factory
    except Exception as exc:  # pigpiod laeuft nicht oder nicht installiert
        log.warning("Servo: pigpio nicht verfuegbar (%s) - Software-PWM, "
                    "Servo kann zittern. Tipp: sudo systemctl enable --now pigpiod", exc)
        return None


class ServoAxis:
    """Dreht den Ventilator (und den Sensor) auf einen Winkel in Grad."""

    def __init__(self, pin=config.PIN_SERVO, min_angle=config.ANGLE_MIN,
                 max_angle=config.ANGLE_MAX):
        from gpiozero import AngularServo

        if min_angle >= max_angle:
            raise ValueError("min_angle muss kleiner als max_angle sein")
        self.min_angle = float(min_angle)
        self.max_angle = float(max_angle)

        # Physikalisch: 0 Grad = 0,5 ms, 180 Grad = 2,5 ms.
        # Die Software-Grenzen (min/max_angle) werden in move_to() erzwungen.
        self._dev = AngularServo(
            pin,
            min_angle=0,
            max_angle=180,
            min_pulse_width=config.SERVO_MIN_PULSE,
            max_pulse_width=config.SERVO_MAX_PULSE,
            initial_angle=None,          # nicht sofort losfahren
            pin_factory=_make_pin_factory(),
        )
        self._angle = None

    @property
    def current_angle(self):
        """Zuletzt angefahrener Winkel (None, solange noch nie bewegt)."""
        return self._angle

    def clamp(self, angle):
        """Winkel auf den erlaubten Bereich begrenzen (Anschlag!)."""
        return max(self.min_angle, min(self.max_angle, float(angle)))

    def move_to(self, angle, wait=True):
        """Faehrt auf angle, wartet danach, bis der Servo steht (SETTLE_TIME)."""
        target = self.clamp(angle)
        previous = self._angle
        self._dev.angle = target
        self._angle = target
        if wait:
            diff = 180.0 if previous is None else abs(target - previous)
            time.sleep(config.SETTLE_TIME + diff * config.SERVO_SEC_PER_DEGREE)
        return target

    def release(self):
        """PWM-Signal abschalten -> Servo haelt nicht mehr, zittert aber auch nicht."""
        self._dev.detach()

    def close(self):
        try:
            self.release()
        finally:
            self._dev.close()
