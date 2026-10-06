FROM ghcr.io/astral-sh/uv:0.12.23@sha256:61d393e44e249f2e4b526b6c7ddcecce245946826e608e11c93ad4f5bba55b21 AS uv

FROM python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2 AS runtime

COPY --from=uv /uv /usr/local/bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy UV_CACHE_DIR=/tmp/uv-cache RUFF_CACHE_DIR=/tmp/ruff-cache
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid 10001 --home-dir /app --no-create-home app
USER 10001:10001
EXPOSE 8000
CMD ["/opt/venv/bin/uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

FROM runtime AS test
USER root
RUN uv sync --locked --extra dev --no-install-project
COPY tests ./tests
USER 10001:10001
