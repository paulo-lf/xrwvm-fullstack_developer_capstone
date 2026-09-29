# Assessment evidence — 50-point rubric

Folders follow the rubric's task numbers. Tasks 14 and 15 share one file and
folder. Required submission filenames are preserved inside each folder; text
evidence has no extension. Open the linked text files to copy their contents,
or upload the linked PNG for screenshot tasks.

| Task | Points | Submission file | Evidence |
| --- | ---: | --- | --- |
| 1 | 1 | [githubURL](task_01/githubURL) | Public GitHub URL of the project README. |
| 2 | 1 | [django_server](task_02/django_server) | Django server terminal output. |
| 3 | 3 | [githubURL](task_03/githubURL) | Public GitHub URL of About.html. |
| 4 | 2 | [githubURL](task_04/githubURL) | Public GitHub URL of Contact.html. |
| 5 | 2 | [loginuser](task_05/loginuser) | Login command and response; see notes below. |
| 6 | 2 | [logoutuser](task_06/logoutuser) | Logout command and response; see notes below. |
| 7 | 1 | [githubURL](task_07/githubURL) | Public GitHub URL of Register.jsx. |
| 8 | 2 | [getdealerreviews](task_08/getdealerreviews) | Dealer reviews command and response. |
| 9 | 2 | [getalldealers](task_09/getalldealers) | All dealers response; cURL command missing. |
| 10 | 2 | [getdealerbyid](task_10/getdealerbyid) | Dealer ID response; cURL command missing. |
| 11 | 2 | [getdealersbyState](task_11/getdealersbyState) | Kansas dealers response; cURL command missing. |
| 12 | 2 | [admin_login.png](task_12/admin_login.png) | Signed-in admin dashboard. |
| 13 | 1 | [admin_logout.png](task_13/admin_logout.png) | Admin logout confirmation. |
| 14–15 | 4 | [getallcarmakes](task_14_15/getallcarmakes) | Command and response for car makes and models. |
| 16 | 2 | [analyzereview](task_16/analyzereview) | Command and positive sentiment response for “Fantastic services”. |
| 17 | 1 | [get_dealers.png](task_17/get_dealers.png) | Dealers before login. |
| 18 | 2 | [get_dealers_loggedin.png](task_18/get_dealers_loggedin.png) | Signed-in dealers, username, Review Dealer, and address bar. |
| 19 | 2 | [dealersbystate.png](task_19/dealersbystate.png) | State-filtered dealers and address bar. |
| 20 | 1 | [dealer_id_reviews.png](task_20/dealer_id_reviews.png) | Dealer details, reviews, and address bar. |
| 21 | 1 | [dealership_review_submission.png](task_21/dealership_review_submission.png) | Filled review form before submission. |
| 22 | 2 | [added_review.png](task_22/added_review.png) | Posted review. |
| 23 | 3 | [CICD](task_23/CICD) | Successful GitHub Actions output with executed steps. |
| 24 | 1 | [deploymentURL](task_24/deploymentURL) | Existing local deployment URL. |
| 25 | 2 | [deployed_landingpage.png](task_25/deployed_landingpage.png) | Existing local deployment capture of /login/. |
| 26 | 2 | [deployed_loggedin.png](task_26/deployed_loggedin.png) | Local deployment after login, with username. |
| 27 | 2 | [deployed_dealer_detail.png](task_27/deployed_dealer_detail.png) | Local deployment dealer details. |
| 28 | 2 | [deployed_add_review.png](task_28/deployed_add_review.png) | Local deployment posted review. |

## Items to address before submission

- **Tasks 5–6:** The login capture uses shell variables for credentials and CSRF
  setup. The logout command does not include the logged-in session's cookies.
  Recapture the paired operations with the necessary request setup and session
  cookies to clearly demonstrate login followed by logout of that same user.
- **Tasks 9–11:** The original files contain JSON responses but omit their cURL
  commands. Recapture each command together with its actual output.
- **Tasks 24–28:** These files document Docker Desktop Kubernetes at
  `http://localhost:8000/`. This address is accessible only on the local machine;
  it is not a public deployment URL. Use a publicly accessible deployment and
  matching captures if required by the course submission.
- **Task 25:** The existing image shows the login form at `/login/`. Capture the
  deployed landing/home page if the rubric expects the dealership homepage.

The four GitHub URLs were derived from this repository's `origin` and `main`
branch, and returned HTTP 200 without authentication on 2026-09-29. This checks
public accessibility, not whether uncommitted local changes are published.

## Organization and capture history

The 23 existing submission files were moved without changing their contents.
`CI_CD.txt` was renamed to the required `CICD`, and `deploymentURL.local.txt` to
`deploymentURL`; the local deployment limitation remains recorded above.
Four `githubURL` text files were added for the source-link tasks.

The old `lab09` through `lab13` folders, development verification logs,
duplicate screenshot folder/ZIP, page-only captures, alternate JPEG, and Finder
metadata were removed. The canonical PNG screenshots with browser address bars
were retained. Two manifests preserve the capture details, with paths updated
relative to this directory:

- [capture_window_manifest.json](capture_window_manifest.json): Tasks 17–22,
  captured on 2026-09-28.
- [capture_deployment_manifest.json](capture_deployment_manifest.json): Tasks
  25–28, captured on 2026-09-29, explicitly scoped to local deployment.

Capture scripts now write to the numbered task folders. The dynamic capture
script's optional page-only mode writes to the system temporary directory under
`dealership_page_evidence`, outside this submission folder. No new application
captures, deployment, publishing, or course submission occurred during this
organization pass.
