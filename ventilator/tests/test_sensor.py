#!/usr/bin/env python3
"""
Hardware-Test DistanceSensor (auf dem Pi ausfuehren):
    python3 tests/test_sensor.py

Hand in 20 / 50 / 100 / 150 cm halten -> Werte plausibel (+-5 cm)?
Nichts davor -> None. Beenden mit Strg+C.
"""
import time

import _pfad  # noqa: F401


def main():
    from sensor import DistanceSensor

    sensor = DistanceSensor()
    print("Messe ... (Strg+C beendet)")
    try:
        while True:
            einzel = sensor.measure_cm()
            median = sensor.measure_median()
            print(f"Einzel: {str(einzel):>6} cm   Median: {str(median):>6} cm")
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass
    finally:
        sensor.close()


if __name__ == "__main__":
    main()
