# Lab 11: Add Dynamic Pages — local macOS adaptation

The dealer list, dealer reviews, and review submission pages now run through the
existing Django application. React handles page content; Django supplies the
pages, session authentication, car catalogue, and proxy APIs. Express/MongoDB
stores dealerships and reviews, and the sentiment service labels review text.

The implementation and all six required screenshot views are complete locally.
The screenshots include the real browser address bar and are saved in
[`server/evidence/`](server/evidence/). This guide explains the changes and how
to reproduce the evidence. The course assessment has not been submitted, and no
AI grade has been recorded.

## 1. Reuse the local environment

The PDF's `/home/project/...` path is a Skills Network path. On this Mac, start
from the existing repository's `server` directory:

```sh
cd "$HOME/Library/Mobile Documents/com~apple~CloudDocs/edx/IBM CAD0321EN Full Stack Application Development Project/00_Development Project/xrwvm-fullstack_developer_capstone/server"
source djangoenv/bin/activate
```

Reuse this virtual environment and the installed frontend dependencies.
For a fresh dependency installation only, run:

```sh
python -m pip install -r requirements.txt -r djangoapp/microservices/requirements.txt
cd frontend
npm ci
cd ..
```

Apply existing migrations and populate the car catalogue if needed:

```sh
python manage.py migrate
python manage.py seed_cars
```

`seed_cars` can be rerun without duplicating its sample records. This lab adds
pages, not database models, so it does not require a new migration.

## 2. Start the three services

Use separate terminals. Each command block starts from `server`.
Reuse an already-running service rather than starting another on the same port.

Express and MongoDB:

```sh
cd database
docker compose up --build
```

Local sentiment service:

```sh
./djangoenv/bin/python -m flask --app djangoapp/microservices/app.py run --host=127.0.0.1 --port=5050
```

Build React, then start Django:

```sh
cd frontend
npm run build
cd ..
./djangoenv/bin/python manage.py runserver 127.0.0.1:8000
```

The existing `djangoapp/.env` points to Express at `http://127.0.0.1:3030`
and sentiment at `http://127.0.0.1:5050/`. The PDF lists a sentiment service
deployed on Code Engine as a prerequisite. This run uses the local service;
it does not establish that the Code Engine prerequisite is satisfied.

## 3. Connect each React page to a Django route

`frontend/src/App.js` imports the three components and maps browser paths to
them. `djangoproj/urls.py` serves the built React `index.html` for those paths,
so opening or refreshing a detail URL works directly.

| React path | Django page path | Component |
| --- | --- | --- |
| `/dealers` | `/dealers/` | `Dealers.jsx` |
| `/dealer/:id` | `/dealer/<int:dealer_id>` | `Dealer.jsx` |
| `/postreview/:id` | `/postreview/<int:dealer_id>` | `PostReview.jsx` |

Django redirects `/dealers` to `/dealers/`; the React route handles that page.
The page routes set a CSRF cookie. Rebuild React after source changes so Django
serves the current JavaScript and CSS.

## 4. Load dealers and filter repeatedly

`Dealers.jsx` calls `GET /djangoapp/get_dealers` and renders the returned
`dealers` array in a table. The state selector derives its options from that
complete list. Selecting Texas calls `GET /djangoapp/get_dealers/Texas`;
selecting All States calls the original unfiltered endpoint again.

Each request constructs a new relative URL. The selected state is controlled
React state, and `AbortController` cancels obsolete requests when it changes.
An old response cannot overwrite a newer selection. The table distinguishes
loading, an empty result, and an HTTP error; failures include a retry button.
Dealer names link to reviews, and authenticated users also see Review Dealer.

## 5. Use the real Django login session

`GET /djangoapp/session` returns `authenticated` and `userName`, supplies a
CSRF cookie, and prevents caching of the session response. The shared
`frontend/src/hooks/useSession.js` hook fetches that endpoint with same-origin
credentials. Header, dealer pages, and the form use its returned `user` state.

The hook synchronizes the existing username display in `sessionStorage`, but
browser storage does not establish authentication. Django checks its signed-in
session again before accepting a review. An expired session therefore cannot
submit a review even if an old username remains in browser storage.

## 6. Show reviews and sentiment

`Dealer.jsx` loads `/djangoapp/dealer/<id>` and
`/djangoapp/reviews/dealer/<id>`. Django retrieves reviews from Express and
asks the sentiment service to label each review as positive, neutral, or
negative. Cards show the review text, an accessible sentiment icon and label,
the author, and purchase details when present.

The component provides independent loading/error states for dealer details
and reviews. A failed review request is not presented as “no reviews.” The
Post Review link appears for an authenticated session.

## 7. Submit a complete purchase review

`PostReview.jsx` loads the selected dealer and `/djangoapp/get_cars`. Its car
selector stores the catalogue row ID, then uses that row's full `CarMake` and
`CarModel` values. Names such as `Land Rover` and `Range Rover` retain spaces.

The form requires review text, purchase date, car make/model, and car year.
It rejects a future purchase date and restricts the year to an integer from
1886 through next year. Submission disables the fields while the request runs.
The JSON body contains `dealership`, `review`, `purchase: true`,
`purchase_date`, `car_make`, `car_model`, and `car_year`.

The POST to `/djangoapp/add_review` includes same-origin session credentials
and `X-CSRFToken`, read from the current `csrftoken` cookie. Django validates
the session and data, derives the author from the authenticated account, and
forwards the review to Express. Only a confirmed success navigates back to
the dealer page, which reloads reviews and their sentiment. Failures remain
visible on the form; an expired session prompts the user to sign in.

## 8. Check the implementation

Run these commands from `server`:

```sh
./djangoenv/bin/python manage.py check
./djangoenv/bin/python manage.py test djangoapp --verbosity 2
cd frontend
CI=true npm test -- --watchAll=false --runInBand
CI=true npm run build
```

The saved run passed 30 Django tests and 11 frontend tests, and the production
build compiled successfully. Coverage includes direct page loads, real session
and CSRF behavior, state switching and restoration, stale responses, service
failures, preserved car names, form validation, and review submission errors.
The build reported outdated Browserslist data; it did not prevent compilation.

Logs are in [`server/evidence/lab11/`](server/evidence/lab11/):
`django_checks.txt`, `test_results.txt`, `frontend_tests.txt`, and
`frontend_build.txt`.

## 9. Review or reproduce the PDF's assessment evidence

Use `http://127.0.0.1:8000` consistently while browsing and signing in.
Keep the real browser address bar visible in every assessment screenshot.
The completed captures use the PDF's requested names:

| PDF page | Browser page and state | Required filename(s) |
| --- | --- | --- |
| 4 | `/dealers/`, anonymous dealer list | [get_dealers.png](server/evidence/get_dealers.png) |
| 4 | `/dealers/`, signed in with Review Dealer available | [get_dealers_loggedin.png](server/evidence/get_dealers_loggedin.png) |
| 5 | `/dealers/`, California selected | [dealersbystate.png](server/evidence/dealersbystate.png) |
| 6 | `/dealer/29`, dealer details and reviews | [dealer_id_reviews.png](server/evidence/dealer_id_reviews.png) |
| 9 | `/postreview/29`, all fields filled before submitting | [dealership_review_submission.png](server/evidence/dealership_review_submission.png) and [dealership_review_submission.jpeg](server/evidence/dealership_review_submission.jpeg) |
| 9 | `/dealer/29`, submitted review and sentiment | [added_review.png](server/evidence/added_review.png) |

Use the same dealer for the final three captures. Confirm the new review's text
and sentiment are visible after submission; scroll as needed while preserving
the address bar. State filtering should also be checked by changing states and
returning to All States.

The native browser-window captures include the actual address bar. Screen
Recording permission is enabled for Visual Studio Code, the host application
for this session. The [completed capture manifest](server/evidence/lab11/capture_window_manifest.json)
records every URL, screenshot filename, and successful browser check, with no
uncaught page errors. Earlier page-only captures remain in
`server/evidence/lab11/page_only/` as supporting evidence.

To reproduce the screenshots, start the services above and run the
[capture script](server/scripts/capture_dynamic_evidence.py) from `server`:

```sh
./djangoenv/bin/python scripts/capture_dynamic_evidence.py \
  --account-file /path/to/protected-local-account.json --mode window
```

Use a protected JSON file containing a local account's `username` and `password`,
kept outside the repository. The script uses the installed Playwright Chromium,
Pillow, and Swift/CoreGraphics to capture the real browser window. It signs in
through the UI and reuses the matching demonstration review on subsequent runs
instead of creating a duplicate. Window mode writes the seven image files to
`server/evidence/`; the two submission-form formats show the same view.

The screenshots are ready for upload through the course assessment interface.
That interface was not provided, so no course submission or AI grade has been
recorded. Changes have not been published to GitHub. The sentiment service was
verified locally on port 5050; the PDF's Code Engine prerequisite has not been
verified by this local run.
