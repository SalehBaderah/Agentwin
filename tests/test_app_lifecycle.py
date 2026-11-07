"""Application failures must release the SQLite connection."""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


def test_database_closes_when_application_context_raises(tmp_path):
    app = create_app(str(tmp_path / 'lifecycle.db'), background=False)
    with pytest.raises(RuntimeError, match='interrupted'):
        with TestClient(app) as client:
            assert client.get('/api/projects').status_code == 200
            raise RuntimeError('interrupted')

    with pytest.raises(sqlite3.ProgrammingError, match='closed database'):
        app.state.store.db.execute('SELECT 1')
