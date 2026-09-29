# Lab 11: Add Dynamic Pages — evidence

Implementation and local browser verification completed on 2026-09-28 for
`11_Lab Add Dynamic Pages.pdf`. Open the app at
[http://127.0.0.1:8000/dealers/](http://127.0.0.1:8000/dealers/).
The [step-by-step guide](../../../LAB11_GUIDE.md) explains the adaptation.

**Assessment evidence status: all six required screenshot views captured and
visually verified with the real browser address bar visible.** Seven image files
are supplied because the PDF names both PNG and JPEG for the submission form.
They are genuine macOS captures of the local test browser; no URL overlays were
added. The [screenshot ZIP](lab11_assessment_screenshots.zip) contains exactly the
seven images listed below, ready to extract for the course's upload fields.

No course submission interface was provided. Nothing was uploaded to the course
or published to GitHub, and no AI grade has been received. The sentiment service
runs locally on port 5050; this verifies the local adaptation, not the PDF's
Code Engine prerequisite.

## Required screenshots

| PDF page | File | Verified content |
| --- | --- | --- |
| 4 | [get_dealers.png](../get_dealers.png) | `/dealers/`: logged-out table, Login/Register, no review column. |
| 4 | [get_dealers_loggedin.png](../get_dealers_loggedin.png) | `/dealers/`: signed-in username, Logout, and Review Dealer links. |
| 5 | [dealersbystate.png](../dealersbystate.png) | `/dealers/`: California selected and six California dealerships. |
| 6 | [dealer_id_reviews.png](../dealer_id_reviews.png) | `/dealer/29`: dealership details, customer reviews, sentiment, and Post Review. |
| 9 | [dealership_review_submission.png](../dealership_review_submission.png) and [dealership_review_submission.jpeg](../dealership_review_submission.jpeg) | `/postreview/29`: completed review, purchase date, Toyota Corolla, year 2023, and submit button. |
| 9 | [added_review.png](../added_review.png) | `/dealer/29`: saved review by “Lab 11 Reviewer”, 2023 Toyota Corolla, and positive sentiment. |

The final window capture recreated the filled form and displayed the same review
that was successfully submitted during the original browser verification. It
reused that saved review instead of inserting a duplicate. The original POST
response is recorded in the page-capture manifest below. The demonstrated
purchase is fictional lab content, not an actual customer experience.

All seven images include the browser address bar. PNG is used for the other
views; the PDF accepts PNG or JPEG. The original page-only captures remain under
[page_only](page_only/) as supporting history; use the files linked above for the
assessment. Earlier labs' evidence remains in place. No password is stored in
this evidence. The demonstration review remains in the local MongoDB data.

## Verification

- [capture_window_manifest.json](capture_window_manifest.json): completed native
  window run, exact URLs and file paths, visible address bars, all browser checks
  passed, and no uncaught page errors. It also verifies anonymous access is
  blocked and All States restores all 50 dealers after filtering.
- [capture_page_manifest.json](capture_page_manifest.json): original live browser
  run, actual successful POST response (`status: 200`, `Review posted.`), and
  positive sentiment on the saved review. These earlier images omit chrome.
- [additional_browser_checks.json](additional_browser_checks.json): anonymous
  direct submission URL hides the form, California returns six dealerships,
  All States restores 50, and the signed-in header shows the username.
- [test_results.txt](test_results.txt): all 30 Django tests passed, including page
  routes, authoritative sessions, CSRF login/submission, and expired sessions.
- [frontend_tests.txt](frontend_tests.txt): all 11 frontend tests passed, covering
  filtering, stale requests, errors/retry, sentiment, full car names, CSRF, and
  submission failures.
- [frontend_build.txt](frontend_build.txt): production build compiled successfully
  with `CI=true`. An outdated Browserslist data notice did not prevent the build.
- [django_checks.txt](django_checks.txt): no Django configuration issues.

Tests isolate their data and mock external services where appropriate. The
browser flow used the running Django, Express/MongoDB, and sentiment services.
All screenshot views were visually checked for readable URLs and required content.

## Reproduce the captures

The [capture script](../../scripts/capture_dynamic_evidence.py) supports
`--mode window` for native macOS browser-window screenshots and `--mode page`
for supporting content-only captures. Window mode requires Screen Recording
permission for the host application. **This session runs in Visual Studio Code,
so Visual Studio Code is the application that needs permission.** The earlier
permission problem is resolved; see [the historical check](screen_recording_check.txt).

The script uses Playwright, Pillow, Swift/CoreGraphics, and the installed local
Chromium browser. These are evidence tools, not application runtime dependencies.
It is restricted to localhost and identifies its own browser process/window.
It logs in through the UI and can create one demonstration review; subsequent
runs reuse the matching review.

From `server`, with a protected temporary JSON file containing a local test
account's `username` and `password`:

```sh
./djangoenv/bin/python scripts/capture_dynamic_evidence.py \
  --account-file /path/to/protected-local-account.json --mode window
```

Keep that account file outside the repository. Window mode saves the requested
filenames directly in `server/evidence/` and records the window manifest under
`server/evidence/lab11/`. Upload those images through the course assessment
interface; preparing this evidence does not itself submit the assessment.
