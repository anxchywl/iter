#!/usr/bin/env python3
# prints a local management url signed like a telegram launch, valid only with the local bot token
import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlencode

def main() -> None:
    if sys.argv[1:] != ["operator"]:
        sys.exit("usage: scripts/local-portal-link.py operator")
    env = dict(
        line.split("=", 1)
        for line in (Path(__file__).parents[1] / ".env.local").read_text().splitlines()
        if "=" in line
    )
    token = env["ITER_TELEGRAM_BOT_TOKEN"]
    user_id, path = 1000001, "/admin"
    fields = {
        "auth_date": str(int(time.time())),
        "user": json.dumps({"id": user_id, "first_name": sys.argv[1]}, separators=(",", ":")),
    }
    check = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    port = os.environ.get("ITER_WEB_PORT", "3018")
    launch = quote(urlencode(fields), safe="")
    print(
        f"http://127.0.0.1:{port}{path}"
        f"#tgWebAppData={launch}&tgWebAppVersion=8.0&tgWebAppPlatform=weba"
    )


if __name__ == "__main__":
    main()
