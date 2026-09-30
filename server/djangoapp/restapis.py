"""HTTP clients used by the Django dealership proxy views."""

import logging
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
searchcars_url = os.getenv(
    "searchcars_url", "http://127.0.0.1:3050/"
).rstrip("/")

logger = logging.getLogger(__name__)


def get_request(endpoint, **kwargs):
    """Fetch backend JSON; keyword arguments become encoded query parameters."""
    request_url = backend_url + "/" + endpoint.lstrip("/")
    response = requests.get(request_url, params=kwargs, timeout=10)
    response.raise_for_status()
    return response.json()


def searchcars_request(endpoint, **kwargs):
    """Read inventory JSON; the view maps upstream HTTP/network failures to 502."""
    request_url = searchcars_url + "/" + endpoint.lstrip("/")
    response = requests.get(request_url, params=kwargs, timeout=10)
    response.raise_for_status()
    result = response.json()
    logger.debug("Car inventory request completed successfully")
    return result


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
