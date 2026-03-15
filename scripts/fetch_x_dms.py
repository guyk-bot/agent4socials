#!/usr/bin/env python3
"""
Fetch recent X (Twitter) Direct Messages from the last ~30 days using the v2 API.
Uses OAuth 1.0a User Context (NOT Bearer / app-only). Requires "Read and write and Direct message" permissions.

Usage:
    pip install -r scripts/requirements-x-dms.txt   # or: pip install requests requests-oauthlib python-dotenv
    cp scripts/.env.x-dms.example .env             # create .env from example, fill in your secrets
    python3 scripts/fetch_x_dms.py

If 401: Regenerate Access Token + Secret in developer.x.com → your app → Keys and tokens.
If 429: DM endpoint is rate-limited (often 1 call per 24h on Pay Per Use/Basic). Check Usage/Billing in console.
If empty: No DMs in 30 days, or E2EE (XChat) messages are not visible via API.

Access level: Many reports say DM read is restricted on Pay Per Use / Basic. In console.x.com → Usage and billing
(or Developer Portal → your app) check whether DMs require Pro. If GET /2/dm_events returns 403 or empty
despite valid OAuth 1.0a and "Read and write and Direct message", upgrading to Pro may be required.
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Load .env from repo root or current dir (python-dotenv must be installed)
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        env_path = Path(".env")
    load_dotenv(env_path)
    _env_file_loaded = str(env_path)
except ImportError:
    _env_file_loaded = None

import requests
from requests_oauthlib import OAuth1Session

# --- Configuration (from .env or environment) ---
BEARER_TOKEN = os.environ.get("TWITTER_BEARER_TOKEN", "").strip()
API_KEY = os.environ.get("TWITTER_API_KEY", "").strip()
API_SECRET = os.environ.get("TWITTER_API_SECRET", "").strip()
ACCESS_TOKEN = os.environ.get("TWITTER_ACCESS_TOKEN", "").strip()
ACCESS_TOKEN_SECRET = os.environ.get("TWITTER_ACCESS_TOKEN_SECRET", "").strip()

DM_EVENTS_URL = "https://api.x.com/2/dm_events"
OUTPUT_DIR = Path(__file__).resolve().parent / "x_dm_backups"


def check_creds(debug=False):
    """Require either TWITTER_BEARER_TOKEN (OAuth 2.0 user token) or all four OAuth 1.0a credentials."""
    if BEARER_TOKEN:
        if debug:
            print(f"Debug: .env loaded from: {_env_file_loaded or 'N/A'}")
            print(f"       Using TWITTER_BEARER_TOKEN (length {len(BEARER_TOKEN)})")
        return
    missing = []
    if not API_KEY:
        missing.append("TWITTER_API_KEY")
    if not API_SECRET:
        missing.append("TWITTER_API_SECRET")
    if not ACCESS_TOKEN:
        missing.append("TWITTER_ACCESS_TOKEN")
    if not ACCESS_TOKEN_SECRET:
        missing.append("TWITTER_ACCESS_TOKEN_SECRET")
    if missing:
        print("Missing credentials. Set either TWITTER_BEARER_TOKEN or all four OAuth 1.0a vars in .env:")
        print("  " + ", ".join(missing))
        sys.exit(1)
    if debug:
        print(f"Debug: .env loaded from: {_env_file_loaded or 'N/A'}")
        print(f"       TWITTER_API_KEY length: {len(API_KEY)}, TWITTER_ACCESS_TOKEN length: {len(ACCESS_TOKEN)}")


def build_session():
    """Build OAuth 1.0a session, or None if using Bearer."""
    if BEARER_TOKEN:
        return None
    return OAuth1Session(
        API_KEY,
        client_secret=API_SECRET,
        resource_owner_key=ACCESS_TOKEN,
        resource_owner_secret=ACCESS_TOKEN_SECRET,
    )


def fetch_page(session, bearer_token, pagination_token=None):
    """
    Fetch one page of DM events from GET /2/dm_events.
    Uses Bearer if bearer_token is set, else session (OAuth 1.0a).
    Returns (response_obj, status_code, response_text).
    """
    params = {
        "max_results": 100,
        "event_types": "MessageCreate",
        "dm_event.fields": "created_at,id,text,sender_id,participant_ids,dm_conversation_id,attachments,referenced_tweets",
        "expansions": "sender_id,attachments.media_keys,referenced_tweets.id",
    }
    if pagination_token:
        params["pagination_token"] = pagination_token

    if bearer_token:
        headers = {"Authorization": f"Bearer {bearer_token}"}
        resp = requests.get(DM_EVENTS_URL, params=params, headers=headers, timeout=30)
    else:
        resp = session.get(DM_EVENTS_URL, params=params, timeout=30)
    return resp, resp.status_code, resp.text


def handle_error(status_code, response_text):
    """Print user-friendly guidance for common errors and exit."""
    print(f"\nRequest failed: status code {status_code}")
    print(f"Response: {response_text[:500]}")
    if status_code == 401:
        print("\n--- 401 Unauthorized ---")
        print("Regenerate your Access Token and Access Token Secret in developer.x.com:")
        print("  Your app → Keys and tokens → Access Token and Secret → Regenerate.")
        print("Then update TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_TOKEN_SECRET in .env.")
        print("Tip: Copy the *Access Token* and *Access Token Secret* (not the API Key/Secret). Run with --debug to verify .env is loaded.")
    elif status_code == 403:
        print("\n--- 403 Forbidden ---")
        print("App may not have DM access. In Developer Portal → your app:")
        print("  User authentication settings → App permissions → Read and write and Direct message.")
        print("  If already set: DM read may be restricted on Pay Per Use/Basic; check Usage/Billing and Pro tier.")
    elif status_code == 429:
        print("\n--- 429 Too Many Requests ---")
        print("DM endpoint is rate-limited. On Pay Per Use / Basic, DMs are often limited (e.g. 1 call/24h).")
        print("Check console.x.com → Usage and billing. Consider Pro tier for higher DM limits.")
    elif status_code >= 400:
        print("\nCheck X API docs and your app's access level (Basic vs Pro) for DMs.")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Fetch X (Twitter) DMs via GET /2/dm_events.")
    parser.add_argument("--debug", action="store_true", help="Print credential lengths and .env path (no secrets).")
    args = parser.parse_args()
    check_creds(debug=args.debug)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session = build_session()
    bearer = BEARER_TOKEN or None

    all_events = []
    page_num = 0
    next_token = None

    auth_type = "Bearer (OAuth 2.0)" if bearer else "OAuth 1.0a"
    print(f"Fetching DM events from GET /2/dm_events ({auth_type})...")
    print("-" * 60)

    while True:
        page_num += 1
        resp, status_code, response_text = fetch_page(session, bearer, next_token)

        if status_code != 200:
            handle_error(status_code, response_text)

        try:
            data = resp.json()
        except json.JSONDecodeError:
            print(f"Invalid JSON: {response_text[:200]}")
            sys.exit(1)

        # Save raw response for backup
        out_file = OUTPUT_DIR / f"dms_page_{page_num}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Saved: {out_file}")

        events = data.get("data") or []
        all_events.extend(events)

        # Optional: expansions (users, media) for richer display
        includes = data.get("includes") or {}
        users = {u["id"]: u for u in (includes.get("users") or [])}

        for ev in events:
            created = ev.get("created_at", "")
            sid = ev.get("sender_id", "")
            text = (ev.get("text") or "").replace("\n", " ")
            conv_id = ev.get("dm_conversation_id", "")
            user_info = users.get(sid, {})
            username = user_info.get("username") or user_info.get("name") or sid
            print(f"  [{created}] @{username} (sender_id={sid}) | {text[:80]}{'…' if len((ev.get('text') or '')) > 80 else ''}")

        if not events:
            if page_num == 1:
                print("No DM events in response. Possible reasons:")
                print("  - No DMs in the last ~30 days")
                print("  - E2EE (XChat) messages are not exposed via API")
                print("  - DM access restricted for your app tier (Pay Per Use/Basic → check Pro for full DM)")
            break

        meta = data.get("meta") or {}
        next_token = meta.get("next_token")
        if not next_token:
            break
        print(f"  ... next page (token present), fetching page {page_num + 1}")

    print("-" * 60)
    print(f"Total messages fetched: {len(all_events)}")
    print(f"Backup files in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
