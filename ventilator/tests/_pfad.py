"""Hilfsmodul: macht den Projektordner (eine Ebene hoeher) importierbar."""
import os
import sys

PROJEKT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJEKT not in sys.path:
    sys.path.insert(0, PROJEKT)
