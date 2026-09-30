"""Capture Lab 11's real browser workflow, without fabricating browser chrome.

Requires the optional local tool ``playwright``. Window mode
requires macOS screen-recording permission and an installed Playwright Chromium.
Page mode saves supporting screenshots only: those omit the browser address bar
and are stored in the temporary directory's dealership_page_evidence folder.
The account file is local JSON with username/password; it is never saved
in the evidence. Running this script may create one local demonstration review.
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


REVIEW = (
    "Excellent service! The friendly team made buying my Toyota Corolla easy "
    "and enjoyable. I highly recommend this dealership."
)
SCREENSHOT_TASKS = {
    "get_dealers": "task_17",
    "get_dealers_loggedin": "task_18",
    "dealersbystate": "task_19",
    "dealer_id_reviews": "task_20",
    "dealership_review_submission": "task_21",
    "added_review": "task_22",
}
SCREEN_ACCESS = "import CoreGraphics\nprint(CGPreflightScreenCaptureAccess())\n"
WINDOWS = r"""
import Foundation
import CoreGraphics
let windows = CGWindowListCopyWindowInfo(
    [.optionAll, .excludeDesktopElements], kCGNullWindowID
) as? [[String: Any]] ?? []
let selected = windows.filter {
    String(describing: $0[kCGWindowOwnerName as String] ?? "") == "Google Chrome for Testing"
    && ($0[kCGWindowLayer as String] as? Int) == 0
}
let data = try JSONSerialization.data(withJSONObject: selected, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
"""


def swift_result(source):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".swift") as handle:
        handle.write(source)
        handle.flush()
        return subprocess.run(
            ["swift", "-module-cache-path", "/tmp/django-lab-swift-cache", handle.name],
            check=True, capture_output=True, text=True,
        ).stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--account-file", type=Path, required=True)
    parser.add_argument("--mode", choices=("window", "page"), default="window")
    parser.add_argument("--dealer-id", type=int, default=29)
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    if urlparse(base_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("This evidence script is restricted to a local lab server.")
    if args.mode == "window" and swift_result(SCREEN_ACCESS) != "true":
        parser.error(
            "macOS screen-recording access is required for genuine address-bar screenshots; "
            "enable it for the host application (Visual Studio Code for this session), "
            "or use --mode page for supporting evidence only."
        )

    account = json.loads(args.account_file.read_text())
    evidence = Path(__file__).resolve().parent.parent / "evidence"
    destination = (
        evidence if args.mode == "window"
        else Path(tempfile.gettempdir()) / "dealership_page_evidence"
    )
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {
        "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "mode": args.mode,
        "address_bar_visible": args.mode == "window",
        "assessment_screenshot_requirement_met": args.mode == "window",
        "screenshots": [], "checks": [], "console_errors": [],
    }
    if args.mode == "page":
        manifest["limitation"] = (
            "Supporting page-content screenshots only. Browser address bars are absent "
            "because macOS screen-recording permission was unavailable. "
            "Recapture window mode for assessment."
        )

    capture_window_id = None

    def capture(page, name):
        nonlocal capture_window_id
        page.wait_for_timeout(250)
        screenshot_dir = destination / SCREENSHOT_TASKS[name] if args.mode == "window" else destination
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        png = screenshot_dir / f"{name}.png"
        if args.mode == "window":
            page.bring_to_front()
            windows = json.loads(swift_result(WINDOWS))
            # Select only this script's browser process; ignore other test windows
            # and transient native panels. Reuse the validated content window.
            windows = [window for window in windows if window["kCGWindowOwnerPID"] == browser_pid]
            if capture_window_id is None:
                candidates = [window for window in windows if page.title() in window.get("kCGWindowName", "")]
                if len(candidates) != 1:
                    raise RuntimeError("Could not uniquely identify this test browser's page window.")
                capture_window_id = candidates[0]["kCGWindowNumber"]
            if not any(window["kCGWindowNumber"] == capture_window_id for window in windows):
                raise RuntimeError("The assessment browser window is no longer available.")
            subprocess.run(
                ["/usr/sbin/screencapture", "-x", "-o", "-l", str(capture_window_id), str(png)],
                check=True,
            )
        else:
            page.screenshot(path=str(png), full_page=False)
        paths = [str(png.relative_to(destination))]
        manifest["screenshots"].append({"name": name, "url": page.url, "files": paths})
        print(f"Saved {name}: {page.url}", flush=True)

    browser_path = Path.home() / (
        "Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/"
        "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    )
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(browser_path), headless=args.mode == "page",
            args=["--window-size=1440,1060", "--window-position=60,40"],
        )
        browser_session = browser.new_browser_cdp_session()
        process_info = browser_session.send("SystemInfo.getProcessInfo")["processInfo"]
        browser_pid = next(int(process["id"]) for process in process_info if process["type"] == "browser")
        context = browser.new_context(
            no_viewport=args.mode == "window",
            viewport=None if args.mode == "window" else {"width": 1440, "height": 960},
        )
        page = context.new_page()
        page.on("pageerror", lambda error: manifest["console_errors"].append(str(error)))
        page.set_default_timeout(20000)
        page.goto(f"{base_url}/dealers/")
        expect(page.get_by_role("heading", name="Car dealerships")).to_be_visible()
        expect(page.locator("tbody tr").first.locator("td")).to_have_count(6)
        expect(page.get_by_role("link", name="Login", exact=True)).to_be_visible()
        capture(page, "get_dealers")
        manifest["checks"].append("Logged-out dealer list loads without review links.")

        page.goto(f"{base_url}/postreview/{args.dealer_id}")
        expect(page.get_by_role("link", name="sign in", exact=True)).to_be_visible()
        expect(page.get_by_label("Your review")).to_have_count(0)
        manifest["checks"].append("Anonymous direct review URL requires sign-in and hides the form.")
        page.get_by_role("link", name="sign in", exact=True).click()
        page.get_by_placeholder("Username", exact=True).fill(account["username"])
        page.get_by_placeholder("Password", exact=True).fill(account["password"])
        page.get_by_role("button", name="Login", exact=True).click()
        page.wait_for_url(f"{base_url}/dealers/")
        expect(page.get_by_role("link", name="Logout", exact=True)).to_be_visible()
        expect(page.get_by_role("columnheader", name="Review Dealer")).to_be_visible()
        capture(page, "get_dealers_loggedin")
        manifest["checks"].append("Login through the UI enables review links.")
        all_dealers_count = page.locator("tbody tr").count()

        dealer_link = page.locator(f'a[href="/dealer/{args.dealer_id}"]')
        dealer_row = page.locator("tbody tr").filter(has=dealer_link)
        state = dealer_row.locator("td").nth(5).inner_text().strip()
        state_search = page.get_by_role("textbox", name="Filter dealerships by state")
        state_search.fill(state.lower())
        page.wait_for_function(
            "state => { const cells = [...document.querySelectorAll('tbody tr td:nth-child(6)')]; "
            "return cells.length > 0 && cells.every(cell => cell.textContent.toLowerCase().includes(state.toLowerCase())); }",
            arg=state,
        )
        expect(page.locator("tbody tr").first.locator("td")).to_have_count(7)
        expect(dealer_link).to_be_visible()
        states = page.locator("tbody tr td:nth-child(6)").all_text_contents()
        if not states or any(state.lower() not in value.lower() for value in states):
            raise AssertionError("State filter displayed an incorrect dealership.")
        capture(page, "dealersbystate")
        manifest["checks"].append(f"State search displays only dealerships matching {state}.")

        state_search.fill("")
        state_search.blur()
        expect(page.locator("tbody tr")).to_have_count(all_dealers_count)
        manifest["checks"].append(f"Clearing the state search and leaving the field restores all {all_dealers_count} dealerships.")

        dealer_link.click()
        expect(page.get_by_role("heading", name="Customer reviews")).to_be_visible()
        expect(page.locator(".review_panel").first).to_be_visible()
        expect(page.get_by_text("Loading reviews…", exact=True)).to_have_count(0)
        already_posted = page.get_by_text(REVIEW, exact=True).count() > 0
        capture(page, "dealer_id_reviews")
        manifest["checks"].append("Dealer link loads its details, customer reviews, and sentiment.")

        page.get_by_role("link", name="Post Review", exact=True).click()
        expect(page.get_by_label("Your review")).to_be_visible()
        page.get_by_label("Your review").fill(REVIEW)
        page.get_by_label("Purchase date").fill("2026-09-28")
        page.get_by_label("Car make and model").select_option(label="Toyota Corolla")
        page.get_by_label("Car year").fill("2023")
        capture(page, "dealership_review_submission")

        if already_posted:
            page.get_by_role("link", name="Back to dealership").click()
            manifest["checks"].append("Reused the already submitted demonstration review; no duplicate was created.")
        else:
            with page.expect_response(
                lambda response: response.url.endswith("/djangoapp/add_review")
                and response.request.method == "POST"
            ) as response_info:
                page.get_by_role("button", name="Post Review", exact=True).click()
            response = response_info.value
            if response.status != 200:
                raise AssertionError(f"Review submission returned HTTP {response.status}.")
            manifest["submission_response"] = response.json()
            manifest["checks"].append("Submitted the completed review through the UI successfully.")
        page.wait_for_url(f"{base_url}/dealer/{args.dealer_id}")
        expect(page.get_by_text(REVIEW, exact=True)).to_be_visible()
        posted_card = page.locator(".review_panel").filter(has_text=REVIEW)
        expect(posted_card.get_by_text("positive", exact=True)).to_be_visible()
        expect(posted_card.get_by_text("2023 Toyota Corolla", exact=True)).to_be_visible()
        posted_card.scroll_into_view_if_needed()
        capture(page, "added_review")
        manifest["checks"].append("Saved review appears with positive sentiment and selected car details.")
        manifest["completed"] = True
        state_file = Path(tempfile.gettempdir()) / "lab11_browser_state.json"
        state_file.touch(mode=0o600, exist_ok=True)
        os.chmod(state_file, 0o600)
        context.storage_state(path=state_file)
        browser.close()

    manifest_path = destination / f"capture_{args.mode}_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Saved {manifest_path}")


if __name__ == "__main__":
    main()
