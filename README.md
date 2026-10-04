# Iter

A Kazakhstan-focused directory of Summer Work Travel jobs. Visitors browse current listings and contact employers through their own sites. It works in a browser or Telegram webview; there are no student accounts or application uploads.

## Run locally

Docker and Compose are required.

```sh
./scripts/local-env.sh
docker compose --env-file .env.local -f compose.local.yaml up --build --wait
```

Run `./scripts/local-seed.sh` to add fictional listings. Open [http://127.0.0.1:3018](http://127.0.0.1:3018). Stop this stack with `docker compose --env-file .env.local -f compose.local.yaml down`.

## Check

Run `./scripts/verify.sh` for migrations, tests, browser smoke checks, image builds, and security scans. It uses a disposable Compose project.

See [product behavior](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), and [infrastructure and release gates](docs/INFRASTRUCTURE.md). Public feedback defaults to off outside local Compose until its data and rate-limit plan is approved. Production deployment is not configured.
