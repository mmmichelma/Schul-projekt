"""
fan.py - Klasse FanController: schaltet den Ventilator ueber das Relais.
"""

import logging

import config

log = logging.getLogger(__name__)


class FanController:
    """Ventilator ein/aus. Merkt sich den Zustand, damit nicht unnoetig geschaltet wird."""

    def __init__(self, pin=config.PIN_RELAY, active_high=config.RELAY_ACTIVE_HIGH):
        from gpiozero import OutputDevice

        # initial_value=False -> beim Start ist der Ventilator sicher aus
        self._dev = OutputDevice(pin, active_high=active_high, initial_value=False)
        self._on = False

    @property
    def is_on(self):
        return self._on

    def on(self):
        if not self._on:
            self._dev.on()
            self._on = True
            log.info("Ventilator AN")

    def off(self):
        if self._on:
            self._dev.off()
            self._on = False
            log.info("Ventilator AUS")

    def close(self):
        # beim Beenden immer aus - auch wenn der gemerkte Zustand falsch waere
        try:
            self._dev.off()
            self._on = False
        finally:
            self._dev.close()
