#!/usr/bin/env python3
"""
Hardware-Test StatusDisplay / LED (auf dem Pi ausfuehren):
    python3 tests/test_status.py

Erwartet: 5 s blinken, 3 s Dauerlicht, dann aus.
"""
import time

import _pfad  # noqa: F401


def main():
    from status import StatusDisplay

    led = StatusDisplay()
    try:
        print("Blinken (Scannen)");      led.show_scanning(); time.sleep(5)
        print("Dauerlicht (erkannt)");   led.show_detected(); time.sleep(3)
        print("Aus (Ruhe)");             led.show_idle();     time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        led.close()


if __name__ == "__main__":
    main()
