# Lab 09 assessment evidence

Tutorial: **09_Lab Build CarModel and CarMake Django Models.pdf**.
Local implementation and evidence verified on 2026-09-24.

## Files for the AI assessment

The requested files are in the parent `server/evidence/` directory:

| File | Evidence | Status |
| --- | --- | --- |
| [admin_login.png](../admin_login.png) | Successful admin login; dashboard includes Car makes and Car models | Existing screenshot visually verified and preserved |
| [admin_logout.png](../admin_logout.png) | Successful admin logout | Existing screenshot visually verified and preserved |
| [getallcarmakes](../getallcarmakes) | Actual curl command and complete JSON response from `/djangoapp/get_cars` | Captured from the local Django server; 5 makes, 15 models |

Keep the exact assessment filenames. `getallcarmakes` is a plain-text file with
no extension. Despite its name, the endpoint returns car models together with
their manufacturers.

The tutorial suggests an additional logout screenshot. Your installed Django
shows a **Logged out** confirmation with a **Log in again** link; the existing
`admin_logout.png` records that successful logout. This differs from the older
lab's description of automatically returning to a login form.

The screenshots `cars.png` and `car models.png` belong to the separate peer
assessment option; they are not required by the AI option followed here.

## Local adaptation and verification

- `CarMake` and `CarModel` have an initial migration, already
  applied to the local SQLite database.
- Both models are registered in the admin; CarMake includes inline CarModels.
- `python manage.py seed_cars` adds missing course samples in one transaction.
  This run added 4 makes and 14 models, preserving the original Toyota and
  Corolla rows (both ID 1) and Toyota's description, `Japanese car manufacturer.`
- Each of the five makes now has three models. Sample models use dealer ID 1
  and year 2023. The numeric dealership ID refers to the separate MongoDB data.
- The API reads data without changing the database and returns the `CarModels`,
  `CarMake`, `CarModel`, and `id` keys used by the frontend.
- `python manage.py check` passed, and `makemigrations --check --dry-run`
  reported no changes.
- All 10 Django tests passed, including seed repeatability, preservation of
  manual records, rollback on validation errors, model validation, relationship
  behavior, API responses, admin lists/inlines, and admin login/logout with CSRF
  (Cross-Site Request Forgery) protection enabled. Tests use a separate database.
- `npm run build` succeeded. Existing warnings concern outdated Browserslist
  data and a deprecated `color-adjust` property in the compiled styles.

Supporting logs, which are not additional required submission files:

- [setup.txt](setup.txt): migration, population, and applied-migration output.
- [test_results.txt](test_results.txt): the final output of the Django test run.
- [frontend_build.txt](frontend_build.txt): React build output and warnings.

## Regenerate the API evidence

From `server`, with `djangoenv` activated:

```sh
python manage.py migrate
python manage.py seed_cars
python manage.py runserver 127.0.0.1:8000
```

In a second terminal, from `server`:

```sh
./djangoenv/bin/python scripts/capture_car_evidence.py
```

The script executes curl and saves its actual response together with the
command. It refuses to replace the evidence if the request fails, the response
is invalid, or no cars are returned. To use another port:

```sh
./djangoenv/bin/python scripts/capture_car_evidence.py --base-url http://127.0.0.1:8005
```

The database itself is local and gitignored. A fresh checkout needs `migrate`
and `seed_cars` before it can return the same sample data. The repository's
root README explains the setup and field mappings.

## GitHub step

Page 9 ends with committing/publishing the updated project to GitHub. Preparing
these files does not upload them to GitHub or submit them to the course. The
working tree also includes changes from earlier labs; review the intended
commit scope before publishing.
