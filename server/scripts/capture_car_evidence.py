"""Capture the real curl command and response required by Lab 09's AI assessment."""

import argparse
import json
from pathlib import Path
import shlex
import subprocess
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        parser.error("--base-url must be an HTTP or HTTPS server URL")

    command = [
        "curl", "-X", "GET", f"{base_url}/djangoapp/get_cars",
        "--silent", "--show-error", "--fail-with-body", "--max-time", "15",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        parser.exit(1, result.stderr + result.stdout + "\nEvidence was not replaced.\n")
    try:
        cars = json.loads(result.stdout)["CarModels"]
        if not isinstance(cars, list) or not cars:
            raise ValueError("no car models returned; run manage.py seed_cars first")
        for car in cars:
            if not {"id", "CarMake", "CarModel"}.issubset(car):
                raise ValueError("a car is missing the expected fields")
    except (KeyError, TypeError, ValueError) as exc:
        parser.exit(1, f"Unexpected API response: {exc}. Evidence was not replaced.\n")

    evidence = Path(__file__).resolve().parent.parent / "evidence" / "task_14_15" / "getallcarmakes"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    # Preserve curl's actual response rather than constructing sample JSON.
    evidence.write_text(shlex.join(command) + "\n" + result.stdout.rstrip("\n") + "\n", encoding="utf-8")
    print(f"Saved {evidence} ({len(cars)} models, {len({car['CarMake'] for car in cars})} makes).")


if __name__ == "__main__":
    main()
