Lab 10: Create Django Proxy Services of Backend APIs

This is a step-by-step adaptation of your supplied PDF to your existing macOS
project. The local implementation was completed and verified on 2026-09-28.
The code below is now a learning/reference guide to the implementation already
in place. Real local AI-option evidence is saved in `server/evidence/analyzereview`;
see [the verification notes](server/evidence/lab10/README.md). Code Engine deployment,
GitHub publication, and course submission have not been performed.

The PDF estimates 120 minutes. Work through one numbered step at a time and check
the result before continuing.

1. **Understand what you are building.** PDF page 1.

   A proxy receives a request, calls another service, and returns a response.
   Here, Django gives the browser one API while coordinating other services:

   ```mermaid
   flowchart LR
       Browser[Browser or curl] --> Django[Django :8000]
       Django --> Express[Express :3030]
       Express --> Mongo[(MongoDB)]
       Django --> Sentiment[Flask sentiment service :5050]
       Django --> SQLite[(SQLite: users and car models)]
   ```

   For example, requesting reviews for dealer 29 causes Django to retrieve those
   reviews from Express, send each review's text to the sentiment service, add
   a `sentiment` field, and return JSON to the browser. The sentiment is computed
   for that response; these steps do not save it back into MongoDB.

   | Component | Its responsibility in this project |
   | --- | --- |
   | `djangoapp/urls.py` | Match a URL to a Python view function. |
   | `djangoapp/views.py` | Handle the incoming request, coordinate calls, return JSON. |
   | `djangoapp/restapis.py` | Make outgoing HTTP requests to Express or Flask. |
   | `database/app.js` | Read and write dealerships/reviews in MongoDB. |
   | `djangoapp/microservices/app.py` | Classify review text with NLTK VADER. |
   | `djangoapp/.env` | Configure the addresses of the external services. |

   Your project has the Express endpoints, authentication, Lab 09 car-model API,
   and the completed Lab 10 HTTP helpers, proxy routes, and views. Existing login,
   logout, registration, and `get_cars` functions remain in place.

2. **Start the existing Express/MongoDB backend.** PDF pages 2–3.

   Open Docker Desktop and wait for its engine to start. In terminal A, start
   from your workspace directory:

   ```sh
   cd xrwvm-fullstack_developer_capstone/server/database
   docker compose up --build
   ```

   `cd` changes directory. `docker compose` reads your `docker-compose.yml`;
   `up` starts the services; `--build` builds the API image first. Your Compose
   configuration starts MongoDB and Express together and publishes Express at
   `http://127.0.0.1:3030`. Keep this terminal running. This is the current Compose
   command spelling; the PDF uses `docker-compose`.
   [Docker command reference](https://docs.docker.com/reference/cli/docker/compose/up/).

   Open terminal B at the workspace directory and enter the Django server folder:

   ```sh
   cd xrwvm-fullstack_developer_capstone/server
   source djangoenv/bin/activate
   curl -sS -X GET "http://127.0.0.1:3030/fetchDealers"
   ```

   `source` activates your existing Python environment in this terminal. `curl`
   makes an HTTP request, `-X GET` explicitly selects GET, and `-sS` hides the
   progress meter while retaining error messages. The response should be a JSON
   array of dealerships. Your supplied sample dataset contains 50 dealerships.

   Use your existing checkout and environment; there is no need to clone again
   or recreate `djangoenv`. All remaining relative paths and commands start from
   `server` unless a step explicitly changes directory. Activate the environment
   again in each new terminal that runs Python.

3. **Run the sentiment service locally.** Local counterpart to PDF pages 7–10.

   In terminal B, install its separate dependencies:

   ```sh
   python -m pip install -r djangoapp/microservices/requirements.txt
   ```

   `python -m pip` runs pip using your activated Python. `-r` reads the listed
   requirements: Flask and NLTK. The Django requirements file does not include
   these two packages.

   Your repository calls the service file `app.py`; the PDF refers to
   `sentiment_analyzer.py`. Use the file that actually exists.

   In `djangoapp/microservices/app.py`, change this route:

   ```python
   @app.get('/analyze/<input_txt>')
   ```

   to:

   ```python
   @app.get('/analyze/<path:input_txt>')
   ```

   The decorator registers a GET endpoint. `<path:input_txt>` passes the text
   into `analyze_sentiment(input_txt)` and allows slash characters in reviews.
   The original string converter excludes slashes. Keep the function body below
   the decorator. [Flask routing documentation](https://flask.palletsprojects.com/en/stable/quickstart/#variable-rules).

   Now start Flask from `server`:

   ```sh
   python -m flask --app djangoapp/microservices/app.py run --host=127.0.0.1 --port=5050
   ```

   `--app` identifies the Flask file;
   `--port=5050` chooses the local port.

   NLTK needs both its Python package and its data. Your project already contains
   `sentiment/vader_lexicon.zip`. The completed `app.py` adds its directory to
   NLTK's search path, so unpacking or downloading the ZIP is unnecessary.
   `NLTK_DATA` is another way to configure a data search directory; the Dockerfile
   sets it explicitly.
   [NLTK data configuration](https://www.nltk.org/data.html).

   Leave Flask running. In terminal C, enter `server`, activate `djangoenv`, then:

   ```sh
   curl -sS -X GET "http://127.0.0.1:5050/analyze/Fantastic%20services"
   ```

   The expected JSON is `{"sentiment": "positive"}`. The corresponding real
   curl output is now saved in the assessment file. `%20` represents a space
   in the URL.

   In the supplied service, `SentimentIntensityAnalyzer()` creates the analyzer
   and `sia.polarity_scores(input_txt)` produces `pos`, `neg`, `neu`, and
   `compound` scores. Its existing code compares the first three and selects
   positive, neutral, or negative, with positive as its initial/default choice.
   It does not currently use the compound score. This is rule-based sentiment
   analysis, separate from the course's AI grader.
   [NLTK VADER API](https://www.nltk.org/api/nltk.sentiment.vader.html).

4. **Configure service URLs and implement the HTTP helpers.** PDF pages 3, 5,
   10, and 13.

   Edit the two relevant entries in `djangoapp/.env`, preserving any other entries:

   ```dotenv
   backend_url=http://127.0.0.1:3030
   sentiment_analyzer_url=http://127.0.0.1:5050/
   ```

   The PDF wants no trailing slash for `backend_url` and a trailing slash for
   `sentiment_analyzer_url` because its examples concatenate strings directly.
   The code below normalizes both addresses. Restart Django after changing `.env`.

   Replace the placeholder contents of `djangoapp/restapis.py` with:

   ```python
   """HTTP clients used by the Django dealership proxy views."""

   import os
   from pathlib import Path
   from urllib.parse import quote

   import requests
   from dotenv import load_dotenv


   # Resolve configuration beside this module, independent of the working directory.
   load_dotenv(Path(__file__).resolve().with_name(".env"))

   backend_url = os.getenv(
       "backend_url", "http://127.0.0.1:3030"
   ).rstrip("/")
   sentiment_analyzer_url = os.getenv(
       "sentiment_analyzer_url", "http://127.0.0.1:5050/"
   ).rstrip("/")


   def get_request(endpoint, **kwargs):
       """Fetch backend JSON; keyword arguments become encoded query parameters."""
       request_url = backend_url + "/" + endpoint.lstrip("/")
       response = requests.get(request_url, params=kwargs, timeout=10)
       response.raise_for_status()
       return response.json()


   def analyze_review_sentiments(text):
       """Encode review text so punctuation cannot change the sentiment URL."""
       request_url = sentiment_analyzer_url + "/analyze/" + quote(text, safe="")
       response = requests.get(request_url, timeout=10)
       response.raise_for_status()
       return response.json()


   def post_review(data_dict):
       """Submit review JSON, allowing HTTP/JSON errors to reach the calling view."""
       request_url = backend_url + "/insert_review"
       response = requests.post(request_url, json=data_dict, timeout=10)
       response.raise_for_status()
       return response.json()
   ```

   Read the syntax as follows:

   | Syntax | Meaning |
   | --- | --- |
   | `import requests` | Load the library used for outgoing HTTP calls. |
   | `__file__` | The path of the current Python module. |
   | `Path(...).resolve().with_name(".env")` | Locate `.env` beside `restapis.py`. |
   | `os.getenv("name", default)` | Read an environment variable, using a fallback if absent. |
   | `.rstrip("/")` / `.lstrip("/")` | Remove slashes at the right/left edge. |
   | `def name(...):` | Define a function; its indented lines form its body. |
   | `**kwargs` | Collect extra named arguments into a dictionary. |
   | `params=kwargs` | Have Requests encode query parameters. |
   | `quote(text, safe="")` | Encode text for use in the URL path. |
   | `timeout=10` | Limit connection/read waiting; this is not a total request deadline. |
   | `raise_for_status()` | Raise an exception for an HTTP error response. |
   | `response.json()` | Decode the returned JSON into Python lists/dictionaries. |
   | `json=data_dict` | Serialize a Python dictionary as the outgoing JSON body. |

   This improves the PDF's helper by encoding parameters, checking HTTP errors,
   and setting a timeout. The view will handle failures rather than returning
   `None` silently. [Requests documentation](https://requests.readthedocs.io/en/latest/user/quickstart/).

   For example, `get_request("/fetchDealers", limit=5)` demonstrates how
   `**kwargs` becomes `{"limit": 5}` and produces a query string `?limit=5`.
   **Your Express endpoint does not implement `limit`; this is syntax only.**
   State filtering uses `/fetchDealers/Texas`, a path parameter, instead.

   An explicit `.env` path avoids depending on directory-search behavior.
   Existing process environment variables take precedence by default when
   `load_dotenv()` loads the file.
   [python-dotenv documentation](https://bbc2.github.io/python-dotenv/).

5. **Add the read-only Django views.** PDF pages 11–12.

   Near the existing imports in `djangoapp/views.py`, add:

   ```python
   import requests
   from urllib.parse import quote
   from .restapis import get_request, analyze_review_sentiments, post_review
   ```

   The leading dot in `.restapis` means “the restapis module in this package.”
   Your file already imports `JsonResponse`, `json`, `require_GET`, and
   `require_POST`; reuse those imports.

   Add the following functions below the existing views, replacing only their
   commented placeholders:

   ```python
   def proxy_error(error):
       """Report an upstream failure as HTTP 502, not a successful empty result."""
       logger.warning("Dealership proxy failed: %s", type(error).__name__)
       return JsonResponse(
           {"status": 502, "message": "A backend service could not complete the request."},
           status=502,
       )


   @require_GET
   def get_dealerships(request, state="All"):
       """Fetch all dealerships, or filter by a state supplied in the URL."""
       endpoint = "/fetchDealers"
       if state != "All":
           endpoint += "/" + quote(state, safe="")

       try:
           dealerships = get_request(endpoint)
           if not isinstance(dealerships, list):
               raise ValueError("Expected a dealership list")
       except (requests.RequestException, ValueError) as error:
           return proxy_error(error)

       return JsonResponse({"status": 200, "dealers": dealerships})


   @require_GET
   def get_dealer_details(request, dealer_id):
       """Keep the backend's one-item array because the React client expects it."""
       try:
           dealers = get_request(f"/fetchDealer/{dealer_id}")
           if not isinstance(dealers, list):
               raise ValueError("Expected a dealership list")
       except (requests.RequestException, ValueError) as error:
           return proxy_error(error)

       if not dealers:
           return JsonResponse(
               {"status": 404, "dealer": [], "message": "Dealer not found."},
               status=404,
           )

       return JsonResponse({"status": 200, "dealer": dealers})


   @require_GET
   def get_dealer_reviews(request, dealer_id):
       """Enrich each review with sentiment without writing to MongoDB."""
       try:
           reviews = get_request(f"/fetchReviews/dealer/{dealer_id}")
           if not isinstance(reviews, list):
               raise ValueError("Expected a review list")

           for review_detail in reviews:
               text = review_detail["review"]
               if not isinstance(text, str):
                   raise ValueError("Expected review text")
               result = analyze_review_sentiments(text)
               sentiment = result["sentiment"]
               if sentiment not in ("positive", "neutral", "negative"):
                   raise ValueError("Unexpected sentiment")
               review_detail["sentiment"] = sentiment
       except (requests.RequestException, ValueError, KeyError, TypeError) as error:
           return proxy_error(error)

       return JsonResponse({"status": 200, "reviews": reviews})
   ```

   `@require_GET` accepts GET and rejects other methods with HTTP 405.
   `state="All"` supplies a default if the URL does not pass a state.
   `f"/fetchDealer/{dealer_id}"` is an f-string: it inserts the value of
   `dealer_id`. `try` runs code that may fail; `except` handles the listed
   exception types. `for ... in reviews` processes each review. Square brackets
   retrieve or assign a dictionary value, such as `review_detail["sentiment"]`.

   Preserve the response keys: `dealers` for the list, `dealer` for details,
   and `reviews` for reviews. Your existing React components expect these exact
   names. Express returns an array even for one dealer; the React detail component
   reads its first element.

   `JsonResponse` serializes the outer dictionary as JSON. The `"status": 502`
   field is data inside that JSON; the separate `status=502` argument sets the
   actual HTTP status. The PDF often sets only the JSON field, which leaves the
   HTTP response at its default 200. Here, upstream failures use HTTP 502.
   [Django response objects](https://docs.djangoproject.com/en/6.1/ref/request-response/#jsonresponse-objects).

   An empty review list is a successful response with `"reviews": []` and
   does not call the sentiment service. This also explains why testing a dealer
   with no reviews cannot verify sentiment integration. Each nonempty review
   causes one sentiment call, so larger lists take longer.

6. **Add the authenticated review-writing view.** PDF pages 13–14.

   Add this to `djangoapp/views.py`:

   ```python
   @require_POST
   def add_review(request):
       """Validate a signed-in user's review before forwarding it to Express."""
       # Authentication comes from the Django session, not browser sessionStorage.
       if not request.user.is_authenticated:
           return JsonResponse(
               {"status": 403, "message": "Sign in before posting a review."},
               status=403,
           )

       try:
           data = json.loads(request.body)
       except (json.JSONDecodeError, UnicodeDecodeError):
           return JsonResponse(
               {"status": 400, "message": "Invalid JSON."}, status=400
           )

       if not isinstance(data, dict):
           return JsonResponse(
               {"status": 400, "message": "Expected a JSON object."}, status=400
           )

       text_fields = ("review", "purchase_date", "car_make", "car_model")
       if any(
           not isinstance(data.get(field), str) or not data[field].strip()
           for field in text_fields
       ):
           return JsonResponse(
               {"status": 400, "message": "Complete the review and purchase details."},
               status=400,
           )

       # React sends numeric form fields as strings. Reject floats and Booleans
       # rather than letting int() silently truncate them or turn True into 1.
       try:
           for field in ("dealership", "car_year"):
               if type(data.get(field)) not in (str, int):
                   raise ValueError("Expected an integer or integer string")
           dealer_id = int(data["dealership"])
           car_year = int(data["car_year"])
           if (
               not 0 < dealer_id <= 2**53 - 1
               or not 1000 <= car_year <= 9999
               or not isinstance(data.get("purchase"), bool)
           ):
               raise ValueError("Invalid review details")
       except ValueError:
           return JsonResponse(
               {"status": 400, "message": "Check the dealer ID, car year, and purchase flag."},
               status=400,
           )

       payload = {field: data[field].strip() for field in text_fields}
       payload.update({
           # The server chooses the author so callers cannot impersonate a reviewer.
           "name": request.user.get_full_name().strip() or request.user.get_username(),
           "dealership": dealer_id,
           "car_year": car_year,
           "purchase": data["purchase"],
       })

       try:
           saved_review = post_review(payload)
           if not isinstance(saved_review, dict) or "id" not in saved_review:
               raise ValueError("Backend did not return a saved review")
       except (requests.RequestException, ValueError) as error:
           return proxy_error(error)

       return JsonResponse({"status": 200, "message": "Review posted."})
   ```

   `@require_POST` restricts the operation to POST. `request.user` comes from
   Django's session authentication; `is_authenticated` is a Boolean property,
   so there are no parentheses. A username in browser `sessionStorage` alone
   does not authenticate a request.

   `request.body` contains the incoming bytes. `json.loads()` decodes them into
   Python data; `isinstance(data, dict)` ensures an object was submitted.
   `data.get(...)` allows missing keys to be checked without a `KeyError`.
   `any(...)` detects at least one invalid text field; `or` short-circuits, so
   `.strip()` is only evaluated after confirming a string. The dictionary
   comprehension copies selected fields, and `.update(...)` adds the rest.

   Dealer IDs and years may arrive as strings from React, so the view checks
   and converts them to integers. It takes the reviewer's name from the signed-in
   account. The four-digit year check is for review input; the Lab 09 Django
   CarModel year limits are a separate model rule. This sample does not verify
   the purchase date's format or whether the chosen dealer/car exists.

   `post_review()` submits to Express's `/insert_review`, and Express saves the
   document in MongoDB. Success is returned only after the backend succeeds.
   The PDF's prose says `post_request`, but its defined function is `post_review`.

7. **Connect the views to URLs.** PDF pages 11–14.

   Add these entries **inside the existing `urlpatterns` list** in
   `djangoapp/urls.py`, before its closing bracket:

   ```python
   path("get_dealers", views.get_dealerships, name="get_dealers"),
   path("get_dealers/<str:state>", views.get_dealerships, name="get_dealers_by_state"),
   path("dealer/<int:dealer_id>", views.get_dealer_details, name="dealer_details"),
   path("reviews/dealer/<int:dealer_id>", views.get_dealer_reviews, name="dealer_reviews"),
   path("add_review", views.add_review, name="add_review"),
   ```

   `path(route, view, name=...)` connects an address to a function. Pass
   `views.get_dealerships` without `()`: Django calls it when a request arrives.
   `<str:state>` captures a string; `<int:dealer_id>` captures and converts a
   number. Their names must match the view parameters. `name=` is a route label,
   not an extra URL segment.

   Your `djangoproj/urls.py` already includes the app under `djangoapp/`. Therefore
   `dealer/<int:dealer_id>` becomes `/djangoapp/dealer/29`. These API routes have
   no trailing slash. [Django URL routing](https://docs.djangoproject.com/en/6.1/topics/http/urls/).

   | Request to Django | Outgoing backend request | Successful JSON keys |
   | --- | --- | --- |
   | `GET /djangoapp/get_dealers` | `GET /fetchDealers` | `status`, `dealers` |
   | `GET /djangoapp/get_dealers/Texas` | `GET /fetchDealers/Texas` | `status`, `dealers` |
   | `GET /djangoapp/dealer/29` | `GET /fetchDealer/29` | `status`, `dealer` |
   | `GET /djangoapp/reviews/dealer/29` | `GET /fetchReviews/dealer/29`, then sentiment calls | `status`, `reviews` |
   | `POST /djangoapp/add_review` | `POST /insert_review` | `status`, `message` |

   This lab adds proxy views and routes, not new Django database models. No new
   migration should be needed. Keep your Lab 09 migrations and seeded data.

8. **Start Django and verify the complete flow.**

   In terminal C, from `server` with the environment active:

   ```sh
   python manage.py check
   python manage.py runserver 127.0.0.1:8000
   ```

   `check` detects common Django configuration problems; it does not verify that
   the other services are available. If a Django server already occupies port
   8000, reuse or restart it rather than starting a second copy.

   In terminal D, from `server` with `djangoenv` active, test each layer:

   ```sh
   curl -sS -X GET "http://127.0.0.1:3030/fetchDealer/29"
   curl -sS -X GET "http://127.0.0.1:5050/analyze/Fantastic%20services"
   curl -sS -X GET "http://127.0.0.1:8000/djangoapp/get_dealers"
   curl -sS -X GET "http://127.0.0.1:8000/djangoapp/get_dealers/Texas"
   curl -sS -X GET "http://127.0.0.1:8000/djangoapp/dealer/29"
   curl -sS -X GET "http://127.0.0.1:8000/djangoapp/reviews/dealer/29"
   ```

   The first two test Express and Flask directly. The final four test Django.
   The Texas response should contain only Texas dealers. Your starter dataset
   includes a review for dealer 29; each returned review should now have a valid
   sentiment label. Its sample review text differs from “Fantastic services,”
   so its label does not have to be positive.

   To test authenticated posting while preserving CSRF protection, create a
   temporary file `scripts/try_lab10_review.py` with the following code. Run
   `python scripts/try_lab10_review.py` using an existing local account.
   **Each successful run inserts one review into your local MongoDB database.**

   ```python
   import getpass
   import requests

   base_url = "http://127.0.0.1:8000"
   session = requests.Session()
   session.get(base_url + "/login/", timeout=10).raise_for_status()

   login_response = session.post(
       base_url + "/djangoapp/login",
       json={
           "userName": input("Username: "),
           "password": getpass.getpass("Password: "),
       },
       headers={"X-CSRFToken": session.cookies["csrftoken"]},
       timeout=10,
   )
   login_response.raise_for_status()

   response = session.post(
       base_url + "/djangoapp/add_review",
       json={
           "dealership": 29,
           "review": "Fantastic services",
           "purchase": True,
           "purchase_date": "2023-06-15",
           "car_make": "Toyota",
           "car_model": "Corolla",
           "car_year": 2023,
       },
       headers={"X-CSRFToken": session.cookies["csrftoken"]},
       timeout=20,
   )
   print("HTTP", response.status_code)
   print(response.text)
   response.raise_for_status()
   ```

   `Session()` retains cookies. Getting `/login/` obtains a CSRF cookie. Signing
   in obtains a session cookie and rotates the CSRF token, so the second POST
   reads its current value again. `getpass` hides the entered password. After
   success, GET the reviews endpoint again to verify the saved review appears.

   An unauthenticated POST with valid CSRF information should return 403. A POST
   missing CSRF information can be rejected by middleware before the view runs;
   it will normally return an HTML 403 page. Keep this distinction in mind when
   debugging. A GET to `add_review` should return 405.

   Your dealer React components exist, but `App.js` currently registers only
   login and registration routes, and Django does not yet serve the dealer pages.
   Use the API checks above for this lab. Connecting those screens is a separate
   frontend step. When doing that step, `PostReview.jsx` must send the CSRF token,
   using the same `getCSRFToken()` helper pattern already in `Login.jsx`:

   ```javascript
   // Inside the existing review fetch options; keep its JSON body.
   credentials: "same-origin",
   headers: {
     "Content-Type": "application/json",
     "X-CSRFToken": getCSRFToken(),
   },
   ```

   Copy or share the helper before using it; it is currently local to the Login
   module. Django's existing login page sets the cookie. Keep the frontend and
   API on the same hostname, for example `127.0.0.1` throughout.
   [Django CSRF guidance](https://docs.djangoproject.com/en/6.1/howto/csrf/).

9. **Complete the Code Engine part when following the PDF's deployment requirement.**

   Local Flask provides a working development substitute. It does **not** prove
   the IBM Code Engine deployment requested on pages 7–10. To match that part of
   the tutorial, deploy the service and capture evidence from its generated URL.

   The following commands assume the course's Code Engine terminal is already
   configured with a selected project, `SN_ICR_NAMESPACE`, and the registry secret
   `icr-secret`. Those are course-environment values, not built-in macOS values.
   In a personal IBM Cloud account, configure a project and registry access first
   using [IBM's deployment instructions](https://cloud.ibm.com/docs/codeengine?topic=codeengine-deploy-app-crimage).

   In `djangoapp/microservices/Dockerfile`, add this line before `CMD` so the
   container can find the bundled lexicon:

   ```dockerfile
   ENV NLTK_DATA=/python-docker
   ```

   The existing Dockerfile copies the service into `/python-docker`. Its Flask
   command listens on container port 5000; local development above used 5050.

   From the course checkout's `server` directory:

   ```sh
   cd djangoapp/microservices
   docker build . -t "us.icr.io/${SN_ICR_NAMESPACE}/senti_analyzer"
   docker push "us.icr.io/${SN_ICR_NAMESPACE}/senti_analyzer"
   ibmcloud ce application create --name sentianalyzer --image "us.icr.io/${SN_ICR_NAMESPACE}/senti_analyzer" --registry-secret icr-secret --port 5000
   ibmcloud ce application get --name sentianalyzer --output url
   ```

   `.` is the build context directory; `-t` names the image.
   `${SN_ICR_NAMESPACE}` expands the lab's registry namespace. `push` uploads the
   image. `application create` deploys it; `--registry-secret` supplies registry
   access and `--port` identifies the container's listening port. These steps
   change your cloud environment when you run them.

   After the app becomes ready, test the returned HTTPS URL with
   `/analyze/Fantastic%20services`, put that base URL in
   `sentiment_analyzer_url` in your local `.env`, and restart Django. The rest
   of the proxy code can stay the same.

10. **Prepare the AI-graded assessment evidence.** PDF pages 9–10.

    This PDF explicitly requests **one new AI-option file**, named exactly
    `analyzereview`, containing both the executed curl command and its terminal
    output. It is a plain-text file with no extension, consistent with your
    existing evidence convention. It is not a screenshot or an explanation essay.

    Run this command, replacing the placeholder with the real deployed base URL:

    ```sh
    curl -X GET "<Your-Sentimental-analyzer-URL>/analyze/Fantastic%20services"
    ```

    For local practice, the corresponding command is:

    ```sh
    curl -X GET "http://127.0.0.1:5050/analyze/Fantastic%20services"
    ```

    The completed project includes a capture script. From `server`, run:

    ```sh
    ./djangoenv/bin/python scripts/capture_sentiment_evidence.py
    ```

    It uses the sentiment URL in `.env` and only saves a successful positive
    response. Pass `--base-url` with your real Code Engine URL when deployed.
    Alternatively, copy the actual command and actual successful output into
    `server/evidence/analyzereview`. From an editor, choose plain text and ensure
    it does not silently append `.txt`. Expected content has this shape:

    ```text
    curl -X GET "https://YOUR-REAL-DEPLOYMENT-URL/analyze/Fantastic%20services"
    {"sentiment": "positive"}
    ```

    The block above is a format example only. Do not submit the placeholder or
    substitute an expected response for a real response. Keep the original
    command/output together. A file from localhost demonstrates local behavior;
    it does not demonstrate cloud deployment. Recapture from Code Engine to
    follow the PDF, unless your course explicitly accepts a local alternative.

    | Item | What to prepare |
    | --- | --- |
    | Required AI evidence | `analyzereview`: exact command plus actual sentiment response. |
    | Peer-assessment alternative | `sentiment_analyzer.png` or `.jpeg`, showing the URL and result. This belongs to Option 2. |
    | Useful personal checks | Dealership list/filter/details, reviews with sentiment, authenticated POST. The PDF does not name extra AI evidence files for these. |
    | Repository work | Save and publish the completed source changes as instructed on page 15. This is separate from uploading assessment evidence. |

    Before submission, check that the URL is real, the command uses GET and
    `Fantastic%20services`, the output says positive, the filename is correct,
    and the text file opens normally. Keep your earlier labs' evidence files.
    Preparing files locally does not upload them to GitHub or submit them to the
    course. Follow the final course submission page for its upload fields; they
    are not supplied in this PDF.

11. **Review and save the completed work.** PDF page 15.

    From `server`, these checks help identify problems before committing:

    ```sh
    python manage.py check
    python manage.py test djangoapp
    git status --short
    git diff -- djangoapp/restapis.py djangoapp/views.py djangoapp/urls.py djangoapp/microservices/app.py djangoapp/microservices/Dockerfile
    ```

    The Django suite now contains 25 tests, including proxy and sentiment checks.
    Live endpoint and authenticated insertion checks also passed; their logs are
    in `server/evidence/lab10`. Your working tree already contains
    changes from previous labs, so inspect the staged changes before committing.
    Include the completed proxy source and real assessment evidence in your
    intended commit. The starter repository tracks `djangoapp/.env`, so the
    existing ignore rule does not untrack it; keep credentials out of that file.
    Publish through your
    normal GitHub workflow after reviewing the changes.

    | Symptom | Check |
    | --- | --- |
    | Connection refused on 3030 | Docker Desktop and the Compose services are running. |
    | `LookupError: vader_lexicon` | `NLTK_DATA` points to the folder containing `sentiment/`. |
    | Connection refused on 5050 | The Flask terminal is running and uses port 5050. |
    | Django returns 502 | Test Express and Flask directly; check their logs and `.env` URLs. |
    | Django API returns 404 | The route is inside `urlpatterns`; the URL includes `/djangoapp/` and has no trailing slash. |
    | Empty review list | Use a dealer with sample reviews, such as 29. |
    | 403 HTML on POST | Supply the current CSRF cookie and `X-CSRFToken` header. |
    | 403 JSON saying to sign in | The Django session is not authenticated. |
    | 405 on `add_review` | Use POST, not a browser address-bar GET. |
    | A dealer page is missing | The API and the React page need separate routing; step 8 explains the current frontend state. |

    You should now be able to explain the request path from a Django URL through
    a view and `restapis.py` to the external service, the difference between JSON
    data and Python dictionaries, and why authenticated POST needs both session
    cookies and CSRF handling.
