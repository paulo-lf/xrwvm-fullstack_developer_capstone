"""Verify the running inventory and Django APIs against the bundled course data.

Only GET requests are made. The expected results are calculated independently
from the seed file, preserving duplicate records supplied by the course.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

import requests


FIELDS = ("dealer_id", "make", "model", "bodyType", "year", "mileage", "price")
SERVER = Path(__file__).resolve().parent.parent


def records(cars):
    return Counter(tuple(car[field] for field in FIELDS) for car in cars)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory-url", default="http://127.0.0.1:3050")
    parser.add_argument("--django-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=Path, default=SERVER / "evidence" / "car_inventory" / "verification.json")
    args = parser.parse_args()
    inventory_url = args.inventory_url.rstrip("/")
    django_url = args.django_url.rstrip("/")
    seed_path = SERVER / "carsInventory" / "data" / "car_records.json"
    cars = json.loads(seed_path.read_text())["cars"]
    checks = []
    session = requests.Session()

    def request(base, endpoint, expected_status=200, params=None):
        response = session.get(base + endpoint, params=params, timeout=15)
        if response.status_code != expected_status:
            raise AssertionError(f"{response.url}: expected {expected_status}, got {response.status_code}")
        return response

    root = request(inventory_url, "/")
    assert root.text == "Welcome to the Mongoose API", root.text
    checks.append({"url": root.url, "status": root.status_code, "message": root.text})

    def compare(dealer_id, route="cars", query=None, expected=None):
        suffix = ""
        if query:
            suffix = "/" + quote(str(next(iter(query.values()))), safe="")
        expected = [car for car in cars if car["dealer_id"] == dealer_id] if expected is None else expected
        direct = request(inventory_url, f"/{route}/{dealer_id}{suffix}")
        proxy = request(django_url, f"/djangoapp/get_inventory/{dealer_id}", params=query)
        direct_cars = direct.json()
        payload = proxy.json()
        assert payload["status"] == 200, payload
        assert records(direct_cars) == records(expected), direct.url
        assert records(payload["cars"]) == records(expected), proxy.url
        checks.append({
            "inventory_url": direct.url, "django_url": proxy.url,
            "status": 200, "matching_records": len(expected),
        })

    # Include two course dealers with no inventory, plus an unknown dealer.
    for dealer_id in sorted({car["dealer_id"] for car in cars} | {4, 50, 99999}):
        compare(dealer_id)
    print(f"Verified all {len(cars)} seed records through both APIs, including empty inventories.", flush=True)

    dealer_id = 29
    dealer_cars = [car for car in cars if car["dealer_id"] == dealer_id]
    for field, route, value in (
        ("make", "carsbymake", "Audi"),
        ("make", "carsbymake", "audi"),
        ("model", "carsbymodel", "Land Cruiser"),
        ("model", "carsbymodel", "Missing model"),
    ):
        compare(dealer_id, route, {field: value}, [car for car in dealer_cars if car[field] == value])
    for year in (2020, 2021, 2022):
        compare(dealer_id, "carsbyyear", {"year": year}, [car for car in dealer_cars if car["year"] >= year])
    for field, route, bounds, last_selector in (
        ("mileage", "carsbymaxmileage", (50000, 100000, 150000, 200000), 200001),
        ("price", "carsbyprice", (20000, 40000, 60000, 80000), 80001),
    ):
        lower = -1
        for upper in bounds:
            expected = [car for car in dealer_cars if lower < car[field] <= upper]
            compare(dealer_id, route, {field: upper}, expected)
            lower = upper
        compare(dealer_id, route, {field: last_selector}, [car for car in dealer_cars if car[field] > bounds[-1]])
    print("Verified all six route types, exact make/model matching, minimum year and all ten bands.", flush=True)

    for base, path, query in (
        (inventory_url, "/cars/0", None),
        (inventory_url, "/cars/invalid", None),
        (inventory_url, "/carsbyyear/29/2021x", None),
        (inventory_url, "/carsbymaxmileage/29/75000", None),
        (inventory_url, "/carsbyprice/29/30000", None),
        (django_url, "/djangoapp/get_inventory", None),
        (django_url, "/djangoapp/get_inventory/0", None),
        (django_url, "/djangoapp/get_inventory/29", {"year": "2021x"}),
        (django_url, "/djangoapp/get_inventory/29", {"mileage": "75000"}),
        (django_url, "/djangoapp/get_inventory/29", {"price": "30000"}),
    ):
        response = request(base, path, 400, query)
        assert isinstance(response.json(), dict)
        checks.append({"url": response.url, "status": 400, "body": response.json()})
    print("Verified HTTP 400 for missing dealer IDs and invalid filters.", flush=True)

    # Existing endpoints are independent of the new inventory service.
    for path in ("/", "/dealers/", "/djangoapp/get_dealers", "/djangoapp/reviews/dealer/29"):
        response = request(django_url, path)
        checks.append({"url": response.url, "status": 200})
    report = {
        "verified_at_utc": datetime.now(timezone.utc).isoformat(),
        "inventory_url": inventory_url, "django_url": django_url,
        "seed_records": len(cars),
        "seed_sha256": hashlib.sha256(seed_path.read_bytes()).hexdigest(),
        "checks": checks, "completed": True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Passed {len(checks)} checks. Report: {args.output}")


if __name__ == "__main__":
    main()
