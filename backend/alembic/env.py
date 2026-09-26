import os
from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context
from app.models import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL is required for migrations")
if not database_url.startswith("postgresql+psycopg://"):
    raise RuntimeError("migrations require a PostgreSQL psycopg URL")


def run_migrations_online() -> None:
    engine = create_engine(database_url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations_online()
