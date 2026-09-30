# Car inventory backend verification

Verified on 30 September 2026 against the local inventory service on port 3050
and Django development server on port 8000. Both new Compose containers
reported healthy. The service imported all 214 records from the course dataset,
including the duplicates present in that dataset.

- All 11 Node tests passed, covering route contracts, band boundaries, invalid
  input, schema fields, database errors, startup ordering and seeding behaviour.
- All 39 Django tests passed, including the nine new inventory tests and the
  existing authentication, dealership, review and car-model tests.
- The inventory Docker image built successfully with its committed dependency
  lockfile. The dependency installation reported zero vulnerabilities.
- Django system checks passed, migrations were already up to date, and
  `git diff --check` passed.
- All 83 live verification checks passed before and after API recreation.

## Saved results

| File | What it verifies |
| --- | --- |
| [verification.json](verification.json) | Every dealer's inventory matches the seed dataset through both APIs; all six route types and all ten mileage/price bands; exact make/model matching; inclusive minimum year; invalid input; existing pages, dealerships and sentiment-enriched reviews. Recorded after API recreation. |
| [error_responses.json](error_responses.json) | Observed HTTP 502 while the inventory service was unavailable, and HTTP 400 for a missing dealer ID. |
| [persistence.json](persistence.json) | Recreating the inventory API container preserved all six dealer-29 documents, including their MongoDB IDs and content. The full 214-record comparison also passed afterward. |

The live checker uses only GET requests and makes no changes to inventory,
users or reviews. Mileage above 50,000 and prices above 80,000 produce empty
results for the supplied data. Band boundaries are also covered by the Node
tests. API verification does not require the Part 3 frontend.

From `server`, with inventory, Django, the dealership backend and the sentiment
service running, reproduce the live report with:

```sh
./djangoenv/bin/python scripts/check_inventory.py
```

The guide covers unit-test commands, startup and filter semantics:
[Car inventory backend for local development](../../../CAR_INVENTORY_GUIDE.md).
The existing Docker Desktop Kubernetes manifest was updated with the inventory
URL for a future rebuild/reapply; this verification does not report a new
Kubernetes rollout.
