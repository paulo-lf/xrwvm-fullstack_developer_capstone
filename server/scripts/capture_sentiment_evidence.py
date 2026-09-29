"""Capture the actual command and response for Lab 10's analyzereview evidence."""

import argparse
import json
from pathlib import Path
import shlex
import subprocess
from urllib.parse import urlsplit

from dotenv import dotenv_values


def main():
    server_dir = Path(__file__).resolve().parent.parent
    config = dotenv_values(server_dir / "djangoapp" / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default=config.get("sentiment_analyzer_url") or "http://127.0.0.1:5050",
        help="Sentiment service address; defaults to djangoapp/.env",
    )
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    parsed = urlsplit(base_url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        parser.error("Use an HTTP(S) base URL without credentials, query, or fragment")

    command = [
        "curl", "-X", "GET", f"{base_url}/analyze/Fantastic%20services",
        "--silent", "--show-error", "--fail-with-body", "--max-time", "60",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        parser.exit(1, result.stderr + result.stdout + "\nEvidence was not replaced.\n")
    try:
        data = json.loads(result.stdout)
        if not isinstance(data, dict) or data.get("sentiment") != "positive":
            raise ValueError("expected a positive sentiment for Fantastic services")
    except ValueError as error:
        parser.exit(1, f"Unexpected response: {error}. Evidence was not replaced.\n")

    evidence = server_dir / "evidence" / "task_16" / "analyzereview"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    # Only replace the evidence after validating the real curl response.
    evidence.write_text(
        shlex.join(command) + "\n" + result.stdout.rstrip("\n") + "\n",
        encoding="utf-8",
    )
    print(f"Saved {evidence}")
    if parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        print("Local-service evidence; this does not demonstrate Code Engine deployment.")


if __name__ == "__main__":
    main()
