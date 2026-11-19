#!/usr/bin/env python3
"""
Hardware-Test ServoAxis (auf dem Pi ausfuehren):
    python3 tests/test_servo.py            # 0 -> 90 -> 180 -> zurueck
    python3 tests/test_servo.py 45         # einen Winkel anfahren (Kalibrierung)

Erst ohne Last, dann mit Ventilator. Schlaegt nichts an?
"""
import sys
import time

import _pfad  # noqa: F401


def main():
    import config
    from servo import ServoAxis

    servo = ServoAxis()
    try:
        if len(sys.argv) > 1:
            ziel = servo.move_to(float(sys.argv[1]))
            print(f"Winkel {ziel} Grad - Enter zum Beenden")
            input()
            return
        mitte = (config.ANGLE_MIN + config.ANGLE_MAX) / 2
        for winkel in (config.ANGLE_MIN, mitte, config.ANGLE_MAX, mitte, config.ANGLE_MIN):
            print(f"-> {winkel} Grad")
            servo.move_to(winkel)
            time.sleep(1.0)
        print("Langsamer Scan in SCAN_STEP-Schritten ...")
        winkel = config.ANGLE_MIN
        while winkel <= config.ANGLE_MAX:
            servo.move_to(winkel)
            winkel += config.SCAN_STEP
        print("Fertig.")
    except KeyboardInterrupt:
        pass
    finally:
        servo.close()


if __name__ == "__main__":
    main()
