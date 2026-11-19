#!/usr/bin/env python3
"""
Hardware-Test FanController / Relais (auf dem Pi ausfuehren):
    python3 tests/test_fan.py

3x an/aus: klickt das Relais, laeuft der Ventilator?
Laeuft er bei "AUS" und steht bei "AN" -> in config.py RELAY_ACTIVE_HIGH umstellen.
"""
import time

import _pfad  # noqa: F401


def main():
    import config
    from fan import FanController

    print(f"RELAY_ACTIVE_HIGH = {config.RELAY_ACTIVE_HIGH}")
    fan = FanController()
    try:
        for i in range(1, 4):
            print(f"{i}. AN");  fan.on();  time.sleep(3)
            print(f"{i}. AUS"); fan.off(); time.sleep(3)
    except KeyboardInterrupt:
        pass
    finally:
        fan.close()
        print("Ventilator aus.")


if __name__ == "__main__":
    main()
