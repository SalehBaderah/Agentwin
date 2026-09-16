"""Keep test scratch files inside the repository on managed Windows machines."""
from pathlib import Path
from uuid import uuid4

def pytest_configure(config):
    if not config.option.basetemp:
        root = Path(__file__).resolve().parents[1] / 'artifacts'
        root.mkdir(exist_ok=True)
        config.option.basetemp = str(root / ('pytest-' + uuid4().hex))
