# Car inventory frontend verification

Verified on 30 September 2026 at <http://127.0.0.1:8000/> with the local
inventory, dealership and sentiment services. The production build completed,
all 37 frontend tests passed, and all 39 Django tests passed. Django's system
check found no issues and migrations were already up to date.

[verification.json](verification.json) records the live browser checks:
public navigation from dealer reviews, the full inventory, the PDF's five-filter
Audi A6 example, mobile layout, clearing/resetting filters, make/model changes,
direct refresh, model names with spaces, empty and missing dealers, and recovery
from a simulated HTTP 502. No uncaught browser JavaScript errors occurred.

| Screenshot | What it shows |
| --- | --- |
| [Dealer link](dealer_search_link.png) | Search Cars is available to anonymous visitors on dealer 21's review page. |
| [All cars](all_cars.png) | All five inventory entries at Andalax Car Dealership, with the five search controls. |
| [Audi A6 result](audi_a6_filtered.png) | All lab criteria selected; one 2022 Audi A6 with 5,000 miles and price $70,000. |
| [Mobile inventory](inventory_mobile.png) | Filters and result card at 390px width, without horizontal page overflow. |
| [No matches](no_matches.png) | No results after increasing the minimum year to 2024. |
| [Inventory error](inventory_error.png) | A browser-simulated HTTP 502 is shown as a retryable error. |

These are genuine Chromium page-content screenshots; they omit browser chrome
and the address bar. The script uses only anonymous browsing and creates no
accounts or reviews. The simulated failure does not stop the inventory service;
retry fetches the real inventory successfully.

Reproduce the captures from `server` while the local services are running:

```sh
./djangoenv/bin/python scripts/capture_inventory_frontend.py
```

See [the frontend guide](../../../CAR_INVENTORY_FRONTEND_GUIDE.md) for setup,
test commands and the full lab requirement mapping.
