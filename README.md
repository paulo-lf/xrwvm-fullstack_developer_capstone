# fullstack_developer_capstone

Best Cars dealership capstone project, adapted for local development on macOS,
without IBM Skills Network or Theia. Includes static pages, user management,
the CarMake/CarModel lab, Django proxy services, and dynamic dealership/review pages.
The Express/MongoDB backend lives in `server/database`.

## Run locally

From this repository's directory:

```sh
cd server
# First setup only; reuse djangoenv if it already exists.
python3 -m venv djangoenv
source djangoenv/bin/activate
python -m pip install -r requirements.txt -r djangoapp/microservices/requirements.txt
cd frontend
npm ci
npm run build
cd ..
python manage.py migrate
python manage.py seed_cars
python manage.py check
python manage.py runserver 127.0.0.1:8000
```

For subsequent sessions, activate `djangoenv` and run the last command.
If port 8000 is already occupied, reuse your running Django server or choose a
free port and use that same port in the URLs below.

- Home: http://127.0.0.1:8000/
- About Us: http://127.0.0.1:8000/about/
- Contact Us: http://127.0.0.1:8000/contact/
- Dealerships: http://127.0.0.1:8000/dealers/
- Example dealer reviews: http://127.0.0.1:8000/dealer/29
- Admin: http://127.0.0.1:8000/admin/
- Car makes/models API: http://127.0.0.1:8000/djangoapp/get_cars

`localhost` also works. `ALLOWED_HOSTS` contains loopback hostnames/IPs, without
schemes or ports. `CSRF_TRUSTED_ORIGINS` can remain empty for these same-origin
local pages; IBM proxy URLs are unnecessary. These are development settings.

Django loads the HTML templates and serves CSS/images from `frontend/static`
through `django.contrib.staticfiles` while `DEBUG=True`. The React login/register
pages use the generated `frontend/build` files. `npm ci` installs the dependencies
recorded in `package-lock.json`; `npm run build` runs the `build` script in
`package.json`. Rebuild after changing React source files. The Django admin and
car API use SQLite and can run without the Express/MongoDB service.

## Lab 09: car makes and models

From `server`, with `djangoenv` activated:

```sh
python manage.py migrate
python manage.py seed_cars
python manage.py check
python manage.py test djangoapp
python manage.py runserver 127.0.0.1:8000
```

`migrate` applies the included `djangoapp/migrations/0001_initial.py` to create
the tables. Use `makemigrations djangoapp` only when changing model definitions.
`--run-syncdb` is unnecessary because this app has a migration.

`seed_cars` calls `initiate()` in `djangoapp/populate.py` to add the tutorial's
five makes and fifteen models. Existing matches are reused, so rerunning it
does not duplicate the sample rows or replace manually entered descriptions.
`get_or_create()` returns `(object, created)`: `created` is a Boolean telling us
whether a new row was inserted. `full_clean()` validates the data, and
`transaction.atomic` rolls back the whole seed if validation fails.

This local adaptation seeds explicitly. `GET /djangoapp/get_cars` only reads
data; it returns `{"CarModels": []}` until you seed or add cars in the admin.
The lab's original automatic seeding checks whether there are zero makes, which
would miss the remaining samples when Toyota has already been added manually.

The names map as follows:

| Name | Meaning | Example |
| --- | --- | --- |
| `CarMake` | Django model for a manufacturer | Toyota |
| `CarModel` | Django model for a car model | Corolla |
| `model.car_make` | Forward foreign key (FK) to one manufacturer | Corolla → Toyota |
| `make.car_models.all()` | Reverse relationship named by `related_name="car_models"` | Toyota → its models |
| `car_make_id` | SQLite column holding the linked `CarMake` primary key (PK) | Toyota's row ID |
| `dealer_id` | Numeric dealership ID in the separate MongoDB service | Sample dealer 1 |

`car_make` and `car_models` are two directions of the relationship, not the same
field. Django enforces the SQL foreign key to `CarMake`; it does not enforce a
foreign key across SQLite and MongoDB. Sample years and vehicle types follow
the course data; the model accepts years 2015–2023 for this exercise.

Both models are registered in `djangoapp/admin.py`. A CarMake edit page includes
its CarModels inline. Use your existing local administrator account. For a fresh
database only, create one with `python manage.py createsuperuser`.

In a second terminal, while the server is running:

```sh
curl -X GET "http://127.0.0.1:8000/djangoapp/get_cars"
```

The API (Application Programming Interface) returns JSON (JavaScript Object
Notation). Each item under `CarModels` has `id`, `CarMake`, and `CarModel` keys;
the frontend expects this capitalization. `select_related("car_make")` loads
models and their manufacturers in a single SQL query.

Lab 09's AI submission files and verification results are listed in
[`server/evidence/lab09/README.md`](server/evidence/lab09/README.md).

## Lab 10: Django proxy services

The completed proxy APIs connect Django to Express/MongoDB and the Flask
sentiment service. Start the backend in one terminal, from `server`:

```sh
cd database
docker compose up --build
```

In a second terminal, from `server`, start the sentiment service:

```sh
source djangoenv/bin/activate
python -m flask --app djangoapp/microservices/app.py run --host=127.0.0.1 --port=5050
```

It finds the included VADER lexicon automatically; no NLTK data download is
needed. In a third terminal, activate `djangoenv` and start Django as above.
The local service addresses in `server/djangoapp/.env` are:

```dotenv
backend_url=http://127.0.0.1:3030
sentiment_analyzer_url=http://127.0.0.1:5050/
```

Restart Django after changing these addresses. Although `.env` appears in
`.gitignore`, this starter file is already tracked; keep credentials out of it.

| Django endpoint | Function |
| --- | --- |
| `GET /djangoapp/get_dealers` | List all dealerships. |
| `GET /djangoapp/get_dealers/Texas` | Filter dealerships by state. |
| `GET /djangoapp/dealer/29` | Return a dealership's details. |
| `GET /djangoapp/reviews/dealer/29` | Fetch reviews and add sentiment to each. |
| `POST /djangoapp/add_review` | Submit a validated review using a signed-in session and CSRF token. |

The POST view derives the author from the authenticated account. It accepts
numeric form values as strings, rejects invalid input with HTTP 400, and reports
upstream failures with HTTP 502. Reading reviews does not write their computed
sentiment to MongoDB. Sentiment classification retains the course's original
positive/negative/neutral score-comparison rule.

The dynamic React pages now call these APIs. See Lab 11 below for the dealership
table, state filter, dealer reviews, and authenticated review submission.

```sh
python manage.py check
python manage.py test djangoapp
./djangoenv/bin/python scripts/capture_sentiment_evidence.py
```

The capture script saves the actual command and successful response to
`server/evidence/analyzereview`. The saved file demonstrates the local service.
For the PDF's Code Engine requirement, deploy the sentiment service and recapture
using `--base-url` with the generated HTTPS URL.

See [the step-by-step guide](LAB10_GUIDE.md) for functionality and syntax, and
[the Lab 10 evidence notes](server/evidence/lab10/README.md) for validation and
assessment requirements.

## Lab 11: dynamic dealership pages

Open `/dealers/` to browse dealerships and filter by state. Selecting a dealer
opens `/dealer/<id>` with reviews and sentiment. Login or register to see the
Review Dealer links; `/postreview/<id>` submits a purchase review and returns to
the dealer page. The browser checks the Django session and sends its CSRF token
with the review. The server determines the author from the signed-in account.

Both React (`frontend/src/App.js`) and Django (`djangoproj/urls.py`) now register
these page routes, including direct loads and refreshes. Rebuild React after
source changes, and restart Django if running with `--noreload`.

The [Lab 11 guide](LAB11_GUIDE.md) explains each step and how to reproduce the
evidence. All six required screenshot views, including both submission-form
formats, are saved in [`server/evidence/`](server/evidence/) with the real browser
address bar visible. The [evidence notes](server/evidence/lab11/README.md) link
the captures and [completed manifest](server/evidence/lab11/capture_window_manifest.json).
Verification passed: 30 Django tests, 11 frontend tests, and the production
build. The screenshots are ready for course upload; no course submission or AI
grade has been recorded, and changes have not been published to GitHub. The
sentiment service was verified locally; this run does not establish the PDF's
Code Engine prerequisite.

## Demo content and images

About Us contains three fictional team profiles. Contact Us uses fictional
contact details and reserved `.example` email addresses; replace them before
using this as a real dealership website.

Portrait photos are saved locally from Random User Generator and illustrate
fictional profiles; the pictured people are not dealership staff:

- `team-maya.jpg`: https://randomuser.me/api/portraits/women/44.jpg
- `team-daniel.jpg`: https://randomuser.me/api/portraits/men/32.jpg
- `team-sofia.jpg`: https://randomuser.me/api/portraits/women/68.jpg

The remaining images and Bootstrap stylesheet come from the starter repository.

## Static-pages lab evidence

`server/evidence/local_static_pages.txt` records the local verification results.
For peer assessment, capture the running terminal and the About/Contact pages
with the browser address bar visible. For AI assessment, the PDF asks for public
GitHub file URLs after publishing your work; localhost URLs are only for local
verification and cannot be used as public submission links.
