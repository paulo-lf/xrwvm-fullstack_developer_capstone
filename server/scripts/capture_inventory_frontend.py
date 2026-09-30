"""Verify the Part 3 inventory UI and capture local page-content screenshots.

Requires the optional Playwright Python package and an installed Chromium.
Uses anonymous browsing and GET requests only. One browser-local HTTP 502
response is simulated to check retry behaviour; the services stay running.
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


SERVER = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--browser-executable", type=Path)
    parser.add_argument("--output-dir", type=Path, default=SERVER / "evidence" / "inventory_frontend")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    if urlparse(base).hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("This capture script is restricted to the local lab server.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        "base_url": base, "address_bar_visible": False,
        "mode": "Local Chromium page-content screenshots",
        "checks": [], "screenshots": [], "page_errors": [],
    }

    def check(message):
        report["checks"].append(message)
        print(message, flush=True)

    def capture(page, filename):
        page.screenshot(path=str(args.output_dir / filename), full_page=True)
        report["screenshots"].append({"file": filename, "url": page.url})

    with sync_playwright() as p:
        default_browser = Path(p.chromium.executable_path)
        existing_browser = Path.home() / (
            "Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/"
            "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
        )
        executable = args.browser_executable or (default_browser if default_browser.exists() else existing_browser)
        if not executable.is_file():
            parser.error("No installed Chromium found. Pass --browser-executable with its path.")
        browser = p.chromium.launch(executable_path=str(executable), headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 960})
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on("pageerror", lambda error: report["page_errors"].append(str(error)))

        def select(field, value, count, dealer_id=21):
            def matches(response):
                url = urlparse(response.url)
                query = {} if value == "all" else {field.lower(): [value]}
                return url.path == f"/djangoapp/get_inventory/{dealer_id}" and parse_qs(url.query) == query
            with page.expect_response(matches) as response:
                page.get_by_role("combobox", name=field, exact=True).select_option(value)
            assert response.value.status == 200
            expect(page.locator(".inventory-card")).to_have_count(count)
            expect(page.get_by_text("Loading cars…", exact=True)).to_have_count(0)

        def reset(count=5):
            page.get_by_role("button", name="Reset filters", exact=True).click()
            expect(page.locator(".inventory-card")).to_have_count(count)
            for name in ("Make", "Model", "Year", "Mileage", "Price"):
                expect(page.get_by_role("combobox", name=name, exact=True)).to_have_value("all")

        page.goto(base + "/dealer/21")
        page.reload()
        expect(page.get_by_role("link", name="Search Cars", exact=True)).to_be_visible()
        expect(page.get_by_role("link", name="Post Review", exact=True)).to_have_count(0)
        expect(page.get_by_text("Loading reviews…", exact=True)).to_have_count(0)
        capture(page, "dealer_search_link.png")
        page.get_by_role("link", name="Search Cars", exact=True).click()
        page.wait_for_url(base + "/searchcars/21")
        expect(page.get_by_role("heading", level=1)).to_have_text(re.compile(r"^Cars at .+"))
        expect(page.locator(".inventory-card")).to_have_count(5)
        capture(page, "all_cars.png")
        check("Anonymous users can open Search Cars from dealer 21 and see all five inventory records.")

        for field, value, count in (
            ("Make", "Audi", 2), ("Model", "A6", 1), ("Year", "2021", 1),
            ("Mileage", "50000", 1), ("Price", "80000", 1),
        ):
            select(field, value, count)
        card = page.locator(".inventory-card")
        expect(card.get_by_role("heading", name="Audi A6", exact=True)).to_be_visible()
        for value in ("2022", "5,000 miles", "$70,000", "Sedan"):
            expect(card.get_by_text(value, exact=True)).to_be_visible()
        capture(page, "audi_a6_filtered.png")
        check("All five filters reproduce the lab example: Audi A6, 2022, 5,000 miles, $70,000.")

        page.set_viewport_size({"width": 390, "height": 844})
        for name in ("Make", "Model", "Year", "Mileage", "Price"):
            control = page.get_by_role("combobox", name=name, exact=True)
            control.scroll_into_view_if_needed()
            expect(control).to_be_visible()
            bounds = control.bounding_box()
            assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 390
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        capture(page, "inventory_mobile.png")
        check("At 390px width all filters and the result card fit without horizontal page overflow.")
        page.set_viewport_size({"width": 1440, "height": 960})

        select("Year", "2024", 0)
        expect(page.get_by_text("No cars found matching criteria.", exact=True)).to_be_visible()
        capture(page, "no_matches.png")
        reset()
        select("Make", "Audi", 2)
        select("Make", "all", 5)
        select("Price", "20000", 3)
        expect(page.get_by_role("combobox", name="Make", exact=True)).to_have_value("all")
        select("Price", "all", 5)
        select("Model", "A6", 1)
        expect(page.get_by_role("combobox", name="Make", exact=True)).to_have_value("Audi")
        select("Make", "Kia", 3)
        expect(page.get_by_role("combobox", name="Model", exact=True)).to_have_value("all")
        reset()
        check("No-match recovery, individual All selections, reset and make/model changes restore the correct records.")

        page.reload()
        expect(page.locator(".inventory-card")).to_have_count(5)
        page.get_by_role("link", name="Back to dealership", exact=True).click()
        page.wait_for_url(base + "/dealer/21")
        expect(page.get_by_role("link", name="Search Cars", exact=True)).to_be_visible()
        check("Direct page refresh and Back to dealership navigation work.")

        page.goto(base + "/searchcars/29")
        expect(page.locator(".inventory-card")).to_have_count(6)
        select("Model", "Land Cruiser", 2, dealer_id=29)
        expect(page.get_by_role("combobox", name="Make", exact=True)).to_have_value("Toyota")
        check("Model names with spaces reach the API correctly and select their matching make.")

        page.goto(base + "/searchcars/4")
        expect(page.get_by_text("No cars are available at this dealership.", exact=True)).to_be_visible()
        expect(page.get_by_role("alert")).to_have_count(0)
        page.goto(base + "/searchcars/99999")
        expect(page.get_by_role("alert")).to_have_text("Dealer not found.")
        check("A valid dealer with no inventory and an unknown dealer display distinct states.")

        def unavailable(route):
            route.fulfill(status=502, content_type="application/json", body=json.dumps({"status": 502}))

        endpoint = base + "/djangoapp/get_inventory/21"
        page.route(endpoint, unavailable)
        page.goto(base + "/searchcars/21")
        expect(page.get_by_role("alert")).to_have_text("Unable to load cars. Please try again.")
        expect(page.get_by_text("No cars are available at this dealership.", exact=True)).to_have_count(0)
        capture(page, "inventory_error.png")
        page.unroute(endpoint, unavailable)
        page.get_by_role("button", name="Try again", exact=True).click()
        expect(page.locator(".inventory-card")).to_have_count(5)
        expect(page.get_by_role("alert")).to_have_count(0)
        check("A browser-simulated inventory HTTP 502 displays an error; retry recovers from the live service.")

        assert not report["page_errors"], report["page_errors"]
        check("No uncaught browser JavaScript errors occurred.")
        browser.close()

    report["completed"] = True
    (args.output_dir / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"Saved screenshots and verification report to {args.output_dir}")


if __name__ == "__main__":
    main()
