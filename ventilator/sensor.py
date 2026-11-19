"""
sensor.py - Klasse DistanceSensor: kapselt den Ultraschallsensor HC-SR04.
"""

import statistics
import time

import config


class DistanceSensor:
    """Misst Entfernungen in cm. Liefert None, wenn nichts im Messbereich ist."""

    def __init__(self, trig=config.PIN_TRIG, echo=config.PIN_ECHO,
                 max_cm=config.MAX_DISTANCE):
        # Import erst hier, damit die anderen Module auch ohne Pi (z. B. fuer
        # die Unit-Tests am Laptop) importiert werden koennen.
        from gpiozero import DistanceSensor as _GpioDistanceSensor

        self.max_cm = max_cm
        # gpiozero misst im Hintergrund selbst. queue_len=1 -> kein internes
        # Mitteln, damit nach einer Servo-Bewegung kein alter Wert kommt.
        # Der Timeout gegen Blockieren steckt in gpiozero (max_distance).
        self._dev = _GpioDistanceSensor(
            echo=echo,
            trigger=trig,
            max_distance=max_cm / 100.0,   # gpiozero rechnet in Metern
            queue_len=1,
            partial=True,
        )

    def measure_cm(self):
        """Eine Einzelmessung in cm oder None (kein Echo / ausserhalb Messbereich)."""
        try:
            meters = self._dev.distance
        except Exception:
            return None
        if meters is None:
            return None
        cm = meters * 100.0
        # 0 = Fehlmessung, >= Maximum = kein Echo (Timeout)
        if cm <= 0.0 or cm >= self.max_cm - 0.5:
            return None
        return round(cm, 1)

    def measure_median(self, n=config.MEDIAN_SAMPLES):
        """Median aus n Messungen gegen Ausreisser. None, wenn keine gueltig war."""
        values = []
        for i in range(n):
            value = self.measure_cm()
            if value is not None:
                values.append(value)
            if i < n - 1:
                time.sleep(config.SAMPLE_GAP)
        # Mehrheit muss gueltig sein, sonst gilt "kein Ziel"
        if len(values) * 2 <= n:
            return None
        return statistics.median(values)

    def close(self):
        self._dev.close()
