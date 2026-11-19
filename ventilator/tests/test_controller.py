#!/usr/bin/env python3
"""
Unit-Test TrackingController mit Attrappen - laeuft OHNE Hardware (auch am Laptop):
    cd ventilator
    python3 -m unittest discover -s tests -v
"""
import types
import unittest

import _pfad  # noqa: F401
import config
from controller import LOST, SCAN, TRACK, TrackingController


# ----------------------------------------------------------------------
# Attrappen (Mocks)
# ----------------------------------------------------------------------
class FakeClock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def advance(self, seconds):
        self.t += seconds


class FakeSensor:
    """Liefert nacheinander die vorgegebenen Werte, danach immer den letzten."""

    def __init__(self, values):
        self.values = list(values)

    def measure_median(self):
        if len(self.values) > 1:
            return self.values.pop(0)
        return self.values[0]


class FakeServo:
    def __init__(self):
        self.current_angle = None
        self.moves = []
        self.released = 0

    def move_to(self, angle, wait=True):
        self.current_angle = angle
        self.moves.append(angle)
        return angle

    def release(self):
        self.released += 1


class FakeFan:
    def __init__(self):
        self.is_on = False
        self.switches = 0

    def on(self):
        if not self.is_on:
            self.switches += 1
        self.is_on = True

    def off(self):
        if self.is_on:
            self.switches += 1
        self.is_on = False


class FakeStatus:
    def __init__(self):
        self.mode = "idle"

    def show_scanning(self):
        self.mode = "scanning"

    def show_detected(self):
        self.mode = "detected"

    def show_idle(self):
        self.mode = "idle"


def make_cfg(**overrides):
    """Kopie von config mit geaenderten Werten (fuer Tests)."""
    values = {k: getattr(config, k) for k in dir(config) if k.isupper()}
    values.update(overrides)
    return types.SimpleNamespace(**values)


# ----------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------
class TrackingControllerTest(unittest.TestCase):

    def build(self, values, **cfg):
        self.clock = FakeClock()
        self.sensor = FakeSensor(values)
        self.servo = FakeServo()
        self.fan = FakeFan()
        self.status = FakeStatus()
        self.ctrl = TrackingController(self.sensor, self.servo, self.fan, self.status,
                                       cfg=make_cfg(**cfg), clock=self.clock,
                                       sleep=lambda s: None)
        self.servo.current_angle = 90.0
        return self.ctrl

    def test_beispielfolge_aus_der_uebersicht(self):
        """300, 300, 120, 120, 300 -> SCAN, SCAN, SCAN, TRACK, LOST"""
        ctrl = self.build([300, 300, 120, 120, 300])
        states = [ctrl.step() for _ in range(5)]
        self.assertEqual(states, [SCAN, SCAN, SCAN, TRACK, LOST])
        self.assertTrue(self.fan.is_on)

    def test_none_ist_kein_treffer(self):
        ctrl = self.build([None, None, None])
        for _ in range(3):
            self.assertEqual(ctrl.step(), SCAN)
        self.assertFalse(self.fan.is_on)

    def test_einzelner_ausreisser_loest_nichts_aus(self):
        ctrl = self.build([300, 120, 300, 300])
        for _ in range(4):
            self.assertEqual(ctrl.step(), SCAN)
        self.assertFalse(self.fan.is_on)

    def test_servo_bleibt_bei_erstem_treffer_stehen(self):
        """Reaktionszeit < 1 s: kein Nachscannen nach dem ersten Treffer."""
        ctrl = self.build([120, 120])
        ctrl.step()
        ctrl.step()
        self.assertEqual(self.servo.moves, [])
        self.assertEqual(ctrl.state, TRACK)
        self.assertEqual(self.status.mode, "detected")

    def test_scan_pendelt_zwischen_min_und_max(self):
        ctrl = self.build([300], ANGLE_MIN=0.0, ANGLE_MAX=20.0, SCAN_STEP=10.0)
        self.servo.current_angle = 0.0
        for _ in range(6):
            ctrl.step()
        self.assertEqual(self.servo.moves, [10.0, 20.0, 10.0, 0.0, 10.0, 20.0])

    def test_lost_kehrt_zu_track_zurueck(self):
        ctrl = self.build([120, 120, 300, 120])
        states = [ctrl.step() for _ in range(4)]
        self.assertEqual(states, [SCAN, TRACK, LOST, TRACK])

    def test_lost_timeout_fuehrt_zu_scan(self):
        ctrl = self.build([120, 120, 300])
        ctrl.step(); ctrl.step(); ctrl.step()
        self.assertEqual(ctrl.state, LOST)
        self.clock.advance(config.LOST_TIMEOUT - 0.5)
        self.assertEqual(ctrl.step(), LOST)
        self.clock.advance(1.0)
        self.assertEqual(ctrl.step(), SCAN)
        self.assertEqual(self.status.mode, "scanning")
        # Luefter laeuft weiter, bis FAN_OFF_DELAY erreicht ist
        self.assertTrue(self.fan.is_on)

    def test_scan_geht_ab_letzter_position_weiter(self):
        ctrl = self.build([120, 120, 300])
        self.servo.current_angle = 40.0
        ctrl.step(); ctrl.step(); ctrl.step()
        self.clock.advance(config.LOST_TIMEOUT + 1)
        ctrl.step()                     # -> SCAN
        ctrl.step()                     # erster Scan-Schritt
        self.assertEqual(self.servo.moves[-1], 40.0 + config.SCAN_STEP)

    def test_luefter_aus_nach_fan_off_delay(self):
        ctrl = self.build([120, 120, 300])
        ctrl.step(); ctrl.step()
        self.assertTrue(self.fan.is_on)
        for _ in range(int(config.FAN_OFF_DELAY) + 2):
            self.clock.advance(1.0)
            ctrl.step()
        self.assertFalse(self.fan.is_on)
        self.assertEqual(ctrl.state, SCAN)

    def test_luefter_bleibt_an_solange_person_da(self):
        ctrl = self.build([120])
        for _ in range(100):
            self.clock.advance(1.0)
            ctrl.step()
        self.assertEqual(ctrl.state, TRACK)
        self.assertTrue(self.fan.is_on)
        self.assertEqual(self.fan.switches, 1)   # kein unnoetiges Schalten

    def test_servo_wird_im_track_freigegeben(self):
        ctrl = self.build([120, 120], SERVO_RELEASE_IN_TRACK=True)
        ctrl.step(); ctrl.step()
        self.assertEqual(self.servo.released, 1)

    def test_manueller_modus_pendelt_ohne_sensor(self):
        clock = FakeClock()
        servo, fan = FakeServo(), FakeFan()
        steps = []

        def fake_sleep(_):
            steps.append(servo.current_angle)
            if len(steps) >= 200:
                ctrl.stop()

        ctrl = TrackingController(None, servo, fan, FakeStatus(),
                                  cfg=make_cfg(ANGLE_MIN=0.0, ANGLE_MAX=180.0),
                                  clock=clock, sleep=fake_sleep)
        ctrl.run_manual()
        self.assertTrue(fan.is_on)
        self.assertEqual(min(steps), 0.0)
        self.assertEqual(max(steps), 180.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
