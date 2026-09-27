import os
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from alembic import command
from app.main import create_app


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("POSTGRES_TEST_URL")
    if not url:
        pytest.skip("POSTGRES_TEST_URL is required for integration tests")
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    old = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    try:
        command.upgrade(config, "head")
    finally:
        if old is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = old
    return url


@pytest.fixture
def client(database_url: str):
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE reports, reviews, listings, employers, audit_events RESTART IDENTITY CASCADE"
            )
        )
    engine.dispose()
    app = create_app(
        database_url,
        {"operator": "test-admin-token-with-at-least-32-characters"},
        feedback_enabled=True,
    )
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-admin-token-with-at-least-32-characters"}
