"""Proxy contracts and failure handling, without contacting live databases/APIs."""

import json
from unittest.mock import patch
from urllib.parse import quote

import requests
from django.contrib.auth import get_user_model
from django.test import Client, SimpleTestCase, TestCase
from django.urls import reverse

from . import restapis


class ProxyReadTests(SimpleTestCase):
    @patch("djangoapp.views.get_request")
    def test_all_dealers_and_state_filters_keep_frontend_contract(self, get_request):
        get_request.return_value = [{"id": 29, "state": "New York"}]
        for url, endpoint in (
            ("/djangoapp/get_dealers", "/fetchDealers"),
            ("/djangoapp/get_dealers/All", "/fetchDealers"),
            ("/djangoapp/get_dealers/New%20York", "/fetchDealers/New%20York"),
        ):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {
                    "status": 200, "dealers": get_request.return_value,
                })
                get_request.assert_called_with(endpoint)

    @patch("djangoapp.views.get_request")
    def test_dealer_details_keep_array_and_return_404_when_missing(self, get_request):
        get_request.return_value = [{"id": 29}]
        url = reverse("djangoapp:dealer_details", args=[29])
        response = self.client.get(url)
        self.assertEqual(response.json(), {"status": 200, "dealer": [{"id": 29}]})
        get_request.assert_called_once_with("/fetchDealer/29")
        get_request.return_value = []
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["dealer"], [])

    @patch("djangoapp.views.analyze_review_sentiments")
    @patch("djangoapp.views.get_request")
    def test_each_review_receives_its_own_sentiment(self, get_request, analyze):
        get_request.return_value = [
            {"id": 1, "review": "Fantastic services"},
            {"id": 2, "review": "Terrible"},
        ]
        analyze.side_effect = [{"sentiment": "positive"}, {"sentiment": "negative"}]
        response = self.client.get(reverse("djangoapp:dealer_reviews", args=[29]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reviews"], [
            {"id": 1, "review": "Fantastic services", "sentiment": "positive"},
            {"id": 2, "review": "Terrible", "sentiment": "negative"},
        ])
        self.assertEqual([call.args[0] for call in analyze.call_args_list], [
            "Fantastic services", "Terrible",
        ])

    @patch("djangoapp.views.analyze_review_sentiments")
    @patch("djangoapp.views.get_request", return_value=[])
    def test_empty_reviews_do_not_call_sentiment(self, get_request, analyze):
        response = self.client.get(reverse("djangoapp:dealer_reviews", args=[1]))
        self.assertEqual(response.json(), {"status": 200, "reviews": []})
        analyze.assert_not_called()

    @patch("djangoapp.views.get_request")
    def test_network_and_invalid_backend_responses_return_http_502(self, get_request):
        urls = [
            reverse("djangoapp:get_dealers"),
            reverse("djangoapp:dealer_details", args=[29]),
            reverse("djangoapp:dealer_reviews", args=[29]),
        ]
        for url in urls:
            for failure in (requests.Timeout(), requests.HTTPError(), ValueError()):
                with self.subTest(url=url, failure=type(failure).__name__):
                    get_request.side_effect = failure
                    response = self.client.get(url)
                    self.assertEqual(response.status_code, 502)
                    self.assertEqual(response.json()["status"], 502)
            get_request.side_effect = None
            get_request.return_value = {"error": "not an array"}
            self.assertEqual(self.client.get(url).status_code, 502)

    @patch("djangoapp.views.analyze_review_sentiments")
    @patch("djangoapp.views.get_request")
    def test_invalid_sentiment_is_not_reported_as_a_neutral_review(self, get_request, analyze):
        get_request.return_value = [{"review": "Fantastic services"}]
        for result in ({}, None, {"sentiment": "unknown"}):
            with self.subTest(result=result):
                analyze.return_value = result
                response = self.client.get(reverse("djangoapp:dealer_reviews", args=[29]))
                self.assertEqual(response.status_code, 502)
        analyze.side_effect = requests.ConnectionError()
        self.assertEqual(
            self.client.get(reverse("djangoapp:dealer_reviews", args=[29])).status_code,
            502,
        )

    @patch("djangoapp.views.get_request")
    def test_methods_and_id_converter_reject_invalid_requests(self, get_request):
        self.assertEqual(self.client.post(reverse("djangoapp:get_dealers")).status_code, 405)
        self.assertEqual(self.client.get("/djangoapp/dealer/not-a-number").status_code, 404)
        self.assertEqual(self.client.get(reverse("djangoapp:add_review")).status_code, 405)
        get_request.assert_not_called()


class ReviewPostTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(
            username="review_test_user", password="test-only-review-password",
            first_name="Test", last_name="Reviewer",
        )

    def setUp(self):
        self.url = reverse("djangoapp:add_review")
        self.data = {
            "name": "Forged author", "dealership": "29", "review": "Fantastic services",
            "purchase": True, "purchase_date": "2023-06-15",
            "car_make": "Toyota", "car_model": "Corolla", "car_year": "2023",
        }

    @patch("djangoapp.views.post_review", return_value={"id": 51})
    def test_real_login_csrf_and_session_allow_post_with_account_author(self, post_review):
        client = Client(enforce_csrf_checks=True)
        client.get("/login/")
        response = client.post(
            reverse("djangoapp:login"),
            {"userName": "review_test_user", "password": "test-only-review-password"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 200)

        response = client.post(self.url, self.data, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        post_review.assert_not_called()

        response = client.post(
            self.url, self.data, content_type="application/json",
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], 200)
        payload = post_review.call_args.args[0]
        self.assertEqual(payload["name"], "Test Reviewer")
        self.assertEqual(payload["dealership"], 29)
        self.assertEqual(payload["car_year"], 2023)
        self.assertEqual(payload["review"], "Fantastic services")

    @patch("djangoapp.views.post_review")
    def test_anonymous_post_with_valid_csrf_is_rejected_before_backend(self, post_review):
        client = Client(enforce_csrf_checks=True)
        client.get("/login/")
        response = client.post(
            self.url, self.data, content_type="application/json",
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["status"], 403)
        post_review.assert_not_called()

    @patch("djangoapp.views.post_review")
    def test_invalid_input_never_reaches_backend(self, post_review):
        self.client.force_login(self.user)
        invalid_inputs = ["{", "[]", "null", "{}"]
        for field, value in (
            ("review", " "), ("review", None), ("car_make", []),
            ("dealership", True), ("dealership", 1.5), ("dealership", 0),
            ("dealership", "x"), ("dealership", 2**53),
            ("car_year", True), ("car_year", "2023.5"), ("car_year", 999),
            ("purchase", "true"),
        ):
            invalid_inputs.append(json.dumps({**self.data, field: value}))
        for data in invalid_inputs:
            with self.subTest(data=data):
                response = self.client.post(self.url, data, content_type="application/json")
                self.assertEqual(response.status_code, 400)
        post_review.assert_not_called()

    @patch("djangoapp.views.post_review")
    def test_failed_insert_is_not_reported_as_success(self, post_review):
        self.client.force_login(self.user)
        for failure in (requests.Timeout(), requests.HTTPError(), ValueError()):
            with self.subTest(failure=type(failure).__name__):
                post_review.side_effect = failure
                response = self.client.post(self.url, self.data, content_type="application/json")
                self.assertEqual(response.status_code, 502)
        post_review.side_effect = None
        post_review.return_value = {"error": "insert failed"}
        response = self.client.post(self.url, self.data, content_type="application/json")
        self.assertEqual(response.status_code, 502)


class RestApiTests(SimpleTestCase):
    @patch("djangoapp.restapis.requests.sessions.Session.send")
    def test_query_parameters_and_review_punctuation_survive_http_encoding(self, send):
        response = requests.Response()
        response.status_code = 200
        response._content = b'{"sentiment":"positive"}'
        send.return_value = response
        with patch.object(restapis, "backend_url", "http://127.0.0.1:3030"):
            restapis.get_request("/fetchDealers", search="A & B", limit=5)
        prepared = send.call_args.args[0]
        self.assertEqual(prepared.url, "http://127.0.0.1:3030/fetchDealers?search=A+%26+B&limit=5")
        self.assertEqual(send.call_args.kwargs["timeout"], 10)

        text = "Great / wonderful? #1 & excellent"
        with patch.object(restapis, "sentiment_analyzer_url", "http://127.0.0.1:5050"):
            self.assertEqual(restapis.analyze_review_sentiments(text), {"sentiment": "positive"})
        self.assertEqual(
            send.call_args.args[0].url,
            "http://127.0.0.1:5050/analyze/Great%20%2F%20wonderful%3F%20%231%20%26%20excellent",
        )

    @patch("djangoapp.restapis.requests.post")
    @patch("djangoapp.restapis.requests.get")
    def test_http_errors_and_invalid_json_propagate_to_views(self, get, post):
        response = requests.Response()
        get.return_value = post.return_value = response
        for call in (
            lambda: restapis.get_request("/fetchDealers"),
            lambda: restapis.analyze_review_sentiments("Fantastic services"),
            lambda: restapis.post_review({"review": "Fantastic services"}),
        ):
            response.status_code = 500
            response._content = b'{"error":"failed"}'
            with self.assertRaises(requests.HTTPError):
                call()
            response.status_code = 200
            response._content = b'<html>Not JSON</html>'
            with self.assertRaises(requests.exceptions.JSONDecodeError):
                call()

    @patch("djangoapp.restapis.requests.sessions.Session.send")
    def test_post_sends_json_and_returns_the_saved_document(self, send):
        response = requests.Response()
        response.status_code = 200
        response._content = b'{"id":51}'
        send.return_value = response
        payload = {"review": "Excellent", "purchase": True}
        self.assertEqual(restapis.post_review(payload), {"id": 51})
        prepared = send.call_args.args[0]
        self.assertEqual(prepared.method, "POST")
        self.assertTrue(prepared.url.endswith("/insert_review"))
        self.assertEqual(prepared.headers["Content-Type"], "application/json")
        self.assertEqual(json.loads(prepared.body), payload)


class SentimentServiceTests(SimpleTestCase):
    def test_bundled_lexicon_and_labels_work_without_a_running_server(self):
        from .microservices.app import app

        client = app.test_client()
        for text, sentiment in (
            ("Fantastic services", "positive"), ("Terrible", "negative"),
            ("Table", "neutral"), ("Great / wonderful? #1 & excellent", "positive"),
        ):
            with self.subTest(text=text):
                response = client.get("/analyze/" + quote(text, safe=""))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.content_type, "application/json")
                self.assertEqual(response.get_json(), {"sentiment": sentiment})
