"""Browser-facing routes, authoritative sessions, and review CSRF integration."""

import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse


class DynamicPagesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(
            username="dynamic_pages_test", password="local-test-password",
            first_name="Test", last_name="Reviewer",
        )

    def test_direct_page_loads_render_react_and_supply_csrf(self):
        for url in ("/dealers/", "/dealer/29", "/postreview/29"):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertTemplateUsed(response, "index.html")
                self.assertContains(response, 'id="root"')
                self.assertIn("csrftoken", response.cookies)

    def test_dealers_without_slash_redirects_to_page(self):
        self.assertRedirects(self.client.get("/dealers"), "/dealers/", status_code=301)

    def test_session_reports_login_and_logout_without_caching(self):
        url = reverse("djangoapp:session")
        response = self.client.get(url)
        self.assertEqual(response.json(), {"authenticated": False, "userName": ""})
        self.assertIn("csrftoken", response.cookies)
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(url).json(), {
            "authenticated": True, "userName": self.user.username,
        })
        self.client.get(reverse("djangoapp:logout"))
        self.assertFalse(self.client.get(url).json()["authenticated"])

    @patch("djangoapp.views.post_review", return_value={"id": 1001})
    def test_browser_login_and_review_require_current_csrf_cookie(self, post_review):
        client = Client(enforce_csrf_checks=True)
        client.get(reverse("djangoapp:session"))
        login = client.post(reverse("djangoapp:login"), json.dumps({
            "userName": self.user.username, "password": "local-test-password",
        }), content_type="application/json", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(login.status_code, 200)
        payload = json.dumps({
            "name": "Forged Author", "dealership": 29, "review": "Excellent service!",
            "purchase": True, "purchase_date": "2026-09-28", "car_make": "Land Rover",
            "car_model": "Range Rover Sport", "car_year": 2023,
        })
        url = reverse("djangoapp:add_review")
        self.assertEqual(client.post(url, payload, content_type="application/json").status_code, 403)
        post_review.assert_not_called()
        response = client.post(url, payload, content_type="application/json",
                               HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(response.status_code, 200)
        saved = post_review.call_args.args[0]
        self.assertEqual(saved["name"], "Test Reviewer")
        self.assertEqual(saved["car_model"], "Range Rover Sport")
        self.assertEqual(saved["car_year"], 2023)

    def test_expired_session_cannot_submit_a_review(self):
        client = Client(enforce_csrf_checks=True)
        client.get(reverse("djangoapp:session"))
        response = client.post(reverse("djangoapp:add_review"), "{}",
                               content_type="application/json",
                               HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(response.status_code, 403)
        self.assertIn("Sign in", response.json()["message"])
