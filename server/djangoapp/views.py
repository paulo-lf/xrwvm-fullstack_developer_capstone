"""Session authentication, local car data, and proxies for the lab services."""

import json
import logging
from urllib.parse import quote

import requests
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .models import CarModel
from .restapis import (
    analyze_review_sentiments, get_request, post_review, searchcars_request,
)

logger = logging.getLogger(__name__)


@never_cache
@ensure_csrf_cookie
@require_GET
def session_status(request):
    """Let React use the real Django session and obtain a CSRF cookie."""
    authenticated = request.user.is_authenticated
    return JsonResponse({
        "authenticated": authenticated,
        "userName": request.user.get_username() if authenticated else "",
    })


@require_POST
def login_user(request):
    # Convert the JSON request body into a Python object.
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON."},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {"error": "Expected a JSON object."},
            status=400,
        )

    username = data.get("userName")
    password = data.get("password")

    # Check the submitted values before authenticating.
    if (
        not isinstance(username, str)
        or not isinstance(password, str)
        or not username.strip()
        or not password
    ):
        return JsonResponse(
            {"error": "Username and password are required."},
            status=400,
        )

    user = authenticate(
        request,
        username=username.strip(),
        password=password,
    )

    if user is None:
        return JsonResponse(
            {"error": "Invalid username or password."},
            status=401,
        )

    # Associate the authenticated user with this browser session.
    login(request, user)

    return JsonResponse({
        "userName": user.get_username(),
        "status": "Authenticated",
    })


@require_GET
def logout_request(request):
    # Remove the authenticated user's session data.
    logout(request)

    # Tell the frontend that no username remains.
    return JsonResponse({
        "userName": ""
    })


@require_POST
def registration(request):
    # Read the JSON submitted by React.
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"status": False, "error": "Invalid JSON."},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {"status": False, "error": "Expected a JSON object."},
            status=400,
        )

    required_fields = [
        "userName",
        "password",
        "email",
        "firstName",
        "lastName",
    ]

    if any(
        not isinstance(data.get(field), str)
        or not data[field].strip()
        for field in required_fields
    ):
        return JsonResponse(
            {"status": False, "error": "Please complete all fields."},
            status=400,
        )

    # Build an unsaved user so we can validate the details.
    user = User(
        username=data["userName"].strip(),
        email=data["email"].strip(),
        first_name=data["firstName"].strip(),
        last_name=data["lastName"].strip(),
    )

    password = data["password"]

    try:
        user.full_clean(exclude=["password"])
        validate_password(password, user=user)
    except ValidationError as error:
        return JsonResponse(
            {
                "status": False,
                "error": " ".join(error.messages),
            },
            status=400,
        )

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=user.username,
                email=user.email,
                password=password,
                first_name=user.first_name,
                last_name=user.last_name,
            )
    except IntegrityError:
        return JsonResponse(
            {
                "status": False,
                "error": "That username is already registered.",
            },
            status=409,
        )

    # Automatically sign in the newly created user.
    login(request, user)

    return JsonResponse(
        {
            "status": True,
            "userName": user.get_username(),
        },
        status=201,
    )


@require_GET
def get_cars(request):
    """Read the available cars; run `manage.py seed_cars` to add lab sample data."""
    car_models = (
        CarModel.objects
        .select_related("car_make")
        .order_by("car_make__name", "name", "id")
    )

    cars = []

    for car_model in car_models:
        cars.append({
            "id": car_model.id,
            "CarModel": car_model.name,
            "CarMake": car_model.car_make.name,
        })

    return JsonResponse({
        "CarModels": cars,
    })


def proxy_error(error):
    """Report an upstream failure as HTTP 502, not a successful empty result."""
    logger.warning("Dealership proxy failed: %s", type(error).__name__)
    return JsonResponse(
        {"status": 502, "message": "A backend service could not complete the request."},
        status=502,
    )


@require_GET
def get_inventory(request, dealer_id=None):
    """Proxy one inventory filter, keeping the course's filter precedence."""
    if dealer_id is None or not 0 < dealer_id < 2**53:
        return JsonResponse(
            {"status": 400, "message": "Bad Request: a positive dealer ID is required."},
            status=400,
        )

    endpoint = f"/cars/{dealer_id}"
    # Part 3 sends one changed filter at a time and combines selections in React.
    filters = (
        ("year", "carsbyyear"),
        ("make", "carsbymake"),
        ("model", "carsbymodel"),
        ("mileage", "carsbymaxmileage"),
        ("price", "carsbyprice"),
    )
    for field, route in filters:
        if field not in request.GET:
            continue
        value = request.GET[field].strip()
        valid = bool(value) and len(value) <= 120 and len(request.GET.getlist(field)) == 1
        if field in ("year", "mileage", "price"):
            valid = valid and value.isascii() and value.isdigit()
            if valid:
                number = int(value)
                if field == "year":
                    valid = 1000 <= number <= 9999
                elif field == "mileage":
                    valid = number in (50000, 100000, 150000, 200000, 200001)
                else:
                    valid = number in (20000, 40000, 60000, 80000, 80001)
                value = str(number)
        if not valid:
            return JsonResponse(
                {"status": 400, "message": f"Bad Request: invalid {field} filter."},
                status=400,
            )
        endpoint = f"/{route}/{dealer_id}/{quote(value, safe='')}"
        break

    try:
        cars = searchcars_request(endpoint)
        if not isinstance(cars, list):
            raise ValueError("Expected a car inventory list")
    except (requests.RequestException, ValueError) as error:
        return proxy_error(error)
    return JsonResponse({"status": 200, "cars": cars})


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
