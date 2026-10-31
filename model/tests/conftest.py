"""Tests run on FPL Draft API responses recorded on 2026-10-31 (during GW9:
GW1-8 finished, GW10 deadline 2026-11-06 18:30 UTC). Re-record with
scripts/record_api.py; the dates below then need updating."""
from datetime import datetime, timezone
from pathlib import Path

import pytest

from outdraft_model.api import RecordedApi, load_season

DATA = Path(__file__).parent / "data"
GW10_DEADLINE = datetime(2026, 11, 6, 18, 30, tzinfo=timezone.utc)
GW11_DEADLINE = datetime(2026, 11, 20, 18, 30, tzinfo=timezone.utc)


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


class EditedApi(RecordedApi):
    """Recorded responses with an edit applied to one path."""

    def __init__(self, path, edit):
        super().__init__(DATA)
        self.path, self.edit = path, edit

    def get(self, path):
        data = super().get(path)
        if path == self.path:
            self.edit(data)
        return data


@pytest.fixture(scope="session")
def api():
    return RecordedApi(DATA)


@pytest.fixture(scope="session")
def season(api):
    return load_season(api)
