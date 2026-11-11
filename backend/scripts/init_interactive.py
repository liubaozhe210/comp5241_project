"""Add interactive course tables without modifying existing data.

Run from backend: python scripts/init_interactive.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db import get_engine
from app.interactive_store import TABLES
from app.models import Base

if __name__ == "__main__":
    Base.metadata.create_all(get_engine(), tables=TABLES)
    print("Interactive course tables ready (3 tables).")
