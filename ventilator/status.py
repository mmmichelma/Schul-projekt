"""
status.py - Klasse StatusDisplay: steuert die Status-LED (Wunschkriterium).

  Scannen / Ziel verloren  -> langsam blinken
  Person erkannt           -> Dauerlicht
  Ruhe                     -> aus
"""

import config


class StatusDisplay:

    def __init__(self, pin=config.PIN_LED):
        from gpiozero import LED

        self._led = LED(pin)
        self.mode = "idle"

    def show_scanning(self):
        if self.mode != "scanning":
            # blink() laeuft im Hintergrund-Thread weiter
            self._led.blink(on_time=config.LED_BLINK_ON,
                            off_time=config.LED_BLINK_OFF, background=True)
            self.mode = "scanning"

    def show_detected(self):
        if self.mode != "detected":
            self._led.on()
            self.mode = "detected"

    def show_idle(self):
        if self.mode != "idle":
            self._led.off()
            self.mode = "idle"

    def close(self):
        try:
            self._led.off()
        finally:
            self._led.close()
