#!/usr/bin/env python3
"""
main.py - Startpunkt des personenverfolgenden Ventilators.

Aufruf:
    python3 main.py                  # Automatik (Personenverfolgung)
    python3 main.py --mode manual    # Oszillier-Modus ohne Messung
    python3 main.py --log ventilator.log --verbose

Beenden mit Strg+C: Ventilator aus, Servo frei, GPIO freigegeben.
"""

import argparse
import logging
import signal
import sys

import config


def parse_args():
    p = argparse.ArgumentParser(description="Personenverfolgender Ventilator")
    p.add_argument("--mode", choices=["auto", "manual"], default="auto",
                   help="auto = Person verfolgen, manual = starr pendeln")
    p.add_argument("--log", default=config.LOG_FILE,
                   help="Logdatei (zusaetzlich zur Konsole)")
    p.add_argument("--verbose", "-v", action="store_true",
                   help="ausfuehrliche Ausgabe (jede Messung)")
    return p.parse_args()


def setup_logging(logfile, verbose):
    handlers = [logging.StreamHandler(sys.stdout)]
    if logfile:
        handlers.append(logging.FileHandler(logfile, encoding="utf-8"))
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        handlers=handlers,
    )


def main():
    args = parse_args()
    setup_logging(args.log, args.verbose)
    log = logging.getLogger("main")

    from controller import TrackingController
    from fan import FanController
    from sensor import DistanceSensor
    from servo import ServoAxis
    from status import StatusDisplay

    devices = []
    controller = None
    try:
        fan = FanController()
        devices.append(fan)
        servo = ServoAxis()
        devices.append(servo)
        status = StatusDisplay()
        devices.append(status)
        sensor = DistanceSensor() if args.mode == "auto" else None
        if sensor is not None:
            devices.append(sensor)

        controller = TrackingController(sensor, servo, fan, status)

        # systemd beendet mit SIGTERM -> genauso sauber wie Strg+C
        signal.signal(signal.SIGTERM, lambda *_: controller.stop())

        if args.mode == "manual":
            controller.run_manual()
        else:
            controller.run()
    except KeyboardInterrupt:
        log.info("Strg+C - beende ...")
    finally:
        if controller is not None:
            controller.stop()
        # Reihenfolge: zuerst Ventilator aus, dann Servo frei, dann der Rest
        for dev in devices:
            try:
                dev.close()
            except Exception as exc:
                log.warning("Fehler beim Aufraeumen von %s: %s", type(dev).__name__, exc)
        log.info("Beendet. Ventilator aus, Servo frei, GPIO freigegeben.")


if __name__ == "__main__":
    main()
