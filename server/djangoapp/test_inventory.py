"""Inventory proxy contract, input validation, and upstream failure handling."""

from unittest.mock import patch

import requests
from django.test import SimpleTestCase
from django.urls import reverse

from . import restapis


class InventoryViewTests(SimpleTestCase):
    @patch("djangoapp.views.searchcars_request")
    def test_dealer_list_and_each_course_filter(self, search):
        car = {
            "dealer_id": 29, "make": "Toyota", "model": "Land Cruiser",
            "bodyType": "SUV", "year": 2021, "mileage": 25000, "price": 25000,
        }
        search.return_value = [car]
        url = reverse("djangoapp:get_inventory", args=[29])
        for query, endpoint in (
            ({}, "/cars/29"),
            ({"make": "Toyota"}, "/carsbymake/29/Toyota"),
            ({"model": "Land Cruiser"}, "/carsbymodel/29/Land%20Cruiser"),
            ({"make": "A & B / Cars?#"}, "/carsbymake/29/A%20%26%20B%20%2F%20Cars%3F%23"),
            ({"year": "2021"}, "/carsbyyear/29/2021"),
            *[({"mileage": str(n)}, f"/carsbymaxmileage/29/{n}")
              for n in (50000, 100000, 150000, 200000, 200001)],
            *[({"price": str(n)}, f"/carsbyprice/29/{n}")
              for n in (20000, 40000, 60000, 80000, 80001)],
        ):
            with self.subTest(query=query):
                response = self.client.get(url, query)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"status": 200, "cars": [car]})
                search.assert_called_with(endpoint)

    @patch("djangoapp.views.searchcars_request", return_value=[])
    def test_no_matches_is_a_successful_empty_array(self, search):
        response = self.client.get("/djangoapp/get_inventory/99999")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": 200, "cars": []})

    @patch("djangoapp.views.searchcars_request", return_value=[])
    def test_multiple_filters_preserve_course_precedence(self, search):
        query = {"year": "2021", "make": "Toyota", "model": "Camry", "mileage": "50000", "price": "40000"}
        for field, route in (
            ("year", "carsbyyear"), ("make", "carsbymake"),
            ("model", "carsbymodel"), ("mileage", "carsbymaxmileage"),
            ("price", "carsbyprice"),
        ):
            response = self.client.get("/djangoapp/get_inventory/29", query)
            self.assertEqual(response.status_code, 200)
            search.assert_called_with(f"/{route}/29/{query.pop(field)}")

    @patch("djangoapp.views.searchcars_request")
    def test_missing_or_invalid_dealer_never_calls_inventory(self, search):
        for url in (
            "/djangoapp/get_inventory", "/djangoapp/get_inventory/0",
            f"/djangoapp/get_inventory/{2**53}",
        ):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["status"], 400)
                self.assertIn("Bad Request", response.json()["message"])
        search.assert_not_called()

    @patch("djangoapp.views.searchcars_request")
    def test_invalid_filters_never_call_inventory(self, search):
        for query in (
            {"year": ""}, {"year": "2021.5"}, {"year": "-1"},
            {"year": "2021abc"}, {"year": "10000"}, {"year": "1e3"},
            {"mileage": "-1"}, {"mileage": "80000"}, {"mileage": "abc"},
            {"price": "25000"}, {"price": "80000.5"}, {"price": "NaN"},
            {"make": " "}, {"model": ""}, {"model": "x" * 121},
            {"price": ["20000", "40000"]},
        ):
            with self.subTest(query=query):
                response = self.client.get("/djangoapp/get_inventory/29", query)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["status"], 400)
        search.assert_not_called()

    @patch("djangoapp.views.searchcars_request")
    def test_upstream_failure_is_502_instead_of_an_empty_inventory(self, search):
        for failure in (requests.Timeout(), requests.ConnectionError(), requests.HTTPError(), ValueError()):
            with self.subTest(failure=type(failure).__name__):
                search.side_effect = failure
                response = self.client.get("/djangoapp/get_inventory/29")
                self.assertEqual(response.status_code, 502)
                self.assertEqual(response.json()["status"], 502)
        search.side_effect = None
        for invalid in ({"error": "failed"}, None, "not an array"):
            search.return_value = invalid
            self.assertEqual(self.client.get("/djangoapp/get_inventory/29").status_code, 502)

    @patch("djangoapp.views.searchcars_request")
    def test_inventory_is_read_only(self, search):
        self.assertEqual(self.client.post("/djangoapp/get_inventory/29").status_code, 405)
        search.assert_not_called()


class InventoryHttpClientTests(SimpleTestCase):
    @patch("djangoapp.restapis.requests.sessions.Session.send")
    def test_base_url_path_query_encoding_and_timeout(self, send):
        response = requests.Response()
        response.status_code = 200
        response._content = b'[]'
        send.return_value = response
        with patch.object(restapis, "searchcars_url", "http://127.0.0.1:3050"):
            self.assertEqual(restapis.searchcars_request("/cars/29", model="A & B"), [])
        self.assertEqual(send.call_args.args[0].url, "http://127.0.0.1:3050/cars/29?model=A+%26+B")
        self.assertEqual(send.call_args.kwargs["timeout"], 10)

    @patch("djangoapp.restapis.requests.get")
    def test_http_and_json_failures_propagate_to_the_view(self, get):
        response = requests.Response()
        get.return_value = response
        response.status_code = 503
        response._content = b'{"error":"offline"}'
        with self.assertRaises(requests.HTTPError):
            restapis.searchcars_request("cars/29")
        response.status_code = 200
        response._content = b'<html>invalid JSON</html>'
        with self.assertRaises(requests.exceptions.JSONDecodeError):
            restapis.searchcars_request("cars/29")
