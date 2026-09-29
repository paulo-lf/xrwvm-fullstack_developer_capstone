Lab 10 assessment evidence

Tutorial: **10_Lab Create Django Proxy Services Of Backend APIs.pdf**.
Local implementation verified on 2026-09-28.

The PDF's AI-graded option on pages 9–10 requests one new plain-text file:
[analyzereview](../analyzereview), with no extension. It contains the actual curl
command and the successful `positive` response for `Fantastic services`.
It was captured from the updated local service at `http://127.0.0.1:5050`.
It is not a sample response or a manually constructed assessment result.

**Deployment scope:** this file demonstrates the local macOS adaptation. The PDF
also asks for IBM Code Engine deployment. No cloud deployment was performed here;
to meet that requirement, deploy the service and recapture from its generated URL.
The course submission interface was not provided, and nothing has been uploaded
to GitHub or submitted to the course by this work.

For the peer-graded alternative only, the PDF requests
`sentiment_analyzer.png` or `.jpeg` showing the URL and sentiment result. That
screenshot is separate from the AI option followed here. Earlier labs' genuine
evidence was preserved; four empty accidental files ending in `printf` or `cd`
were removed.

To regenerate the AI evidence, keep the sentiment service running and execute
from `server`:

```sh
./djangoenv/bin/python scripts/capture_sentiment_evidence.py
```

The script reads the configured sentiment URL from `djangoapp/.env`. For cloud
evidence, pass `--base-url` followed by the real generated HTTPS base URL. It runs
curl, validates a successful positive response, and then saves the command and
unchanged response body. A failed request does not replace existing evidence.

Additional verification files below support local development; the PDF does
not name them as additional AI submission files:

| File | What was verified |
| --- | --- |
| [test_results.txt](test_results.txt) | All 25 Django tests passed: 10 existing tests and 15 proxy/sentiment tests, with isolated test data. |
| [live_get_checks.txt](live_get_checks.txt) | Actual commands and JSON from Django: 50 dealers, 8 Texas dealers, dealer 29 details/reviews with sentiment, and 15 car models. |
| [live_post_check.txt](live_post_check.txt) | Real Express/MongoDB insertion through the Django view, session login, CSRF, author selection, and sentiment on the saved review. Temporary account/session/review data was removed afterward. |
| [container_check.txt](container_check.txt) | The updated Docker image built successfully and returned positive sentiment with container networking disabled. |

The live POST check used Django's request test client with CSRF enforcement and
the real outgoing HTTP helpers. It contacted the running Express and sentiment
services. The live GET log and assessment file used actual curl network requests.
`python manage.py check` also reported no issues. Expected timeout/error warnings
in the test log come from deliberate failure tests.

The completed source includes HTTP timeouts, URL encoding, proper HTTP error
statuses, authenticated review posting, and a sentiment service that reads its
bundled lexicon without downloading data. The Dockerfile uses Python 3.12 and
explicitly starts Flask on container port 5000; local Flask uses port 5050.
The [learning guide](../../../LAB10_GUIDE.md) explains the implementation.
