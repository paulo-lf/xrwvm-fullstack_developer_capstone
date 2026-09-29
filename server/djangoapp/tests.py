from io import StringIO

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client, TestCase
from django.urls import reverse

from .models import CarMake, CarModel
from .populate import initiate


class PopulateTests(TestCase):
    def test_seed_command_can_be_run_twice_without_duplicates(self):
        output = StringIO()
        call_command("seed_cars", stdout=output)
        self.assertIn("Created 5 car makes and 15 car models.", output.getvalue())
        original_ids = list(CarModel.objects.order_by("id").values_list("id", flat=True))

        output = StringIO()
        call_command("seed_cars", stdout=output)
        self.assertIn("Created 0 car makes and 0 car models.", output.getvalue())
        self.assertEqual(CarMake.objects.count(), 5)
        self.assertEqual(
            list(CarModel.objects.order_by("id").values_list("id", flat=True)),
            original_ids,
        )
        for make in CarMake.objects.all():
            self.assertEqual(make.car_models.count(), 3)
        self.assertEqual(set(CarModel.objects.values_list("dealer_id", flat=True)), {1})

    def test_seed_preserves_manual_records_and_fills_missing_data(self):
        toyota = CarMake.objects.create(name="Toyota", description="My description")
        corolla = CarModel.objects.create(
            car_make=toyota, name="Corolla", type="Wagon", year=2023, dealer_id=1,
        )
        other = CarModel.objects.create(
            car_make=toyota, name="Yaris", type="Sedan", year=2022, dealer_id=2,
        )

        self.assertEqual(initiate(), {"makes": 4, "models": 14})
        toyota.refresh_from_db()
        corolla.refresh_from_db()
        self.assertEqual(toyota.description, "My description")
        self.assertEqual(corolla.type, "Wagon")
        self.assertTrue(CarModel.objects.filter(pk=other.pk).exists())
        self.assertEqual(CarModel.objects.count(), 16)

    def test_invalid_existing_data_rolls_back_all_seed_changes(self):
        # save()/create() do not call full_clean(); the seed explicitly does.
        toyota = CarMake.objects.create(name="Toyota", description="My description")
        CarModel.objects.create(
            car_make=toyota, name="Corolla", type="Invalid", year=2023, dealer_id=1,
        )
        with self.assertRaises(ValidationError):
            initiate()
        self.assertEqual(CarMake.objects.count(), 1)
        self.assertEqual(CarModel.objects.count(), 1)


class CarModelTests(TestCase):
    def setUp(self):
        self.make = CarMake.objects.create(name="Toyota", description="Japanese cars")

    def test_relationship_in_both_directions_and_cascade(self):
        model = CarModel.objects.create(
            car_make=self.make, name="Corolla", type="Sedan", year=2023, dealer_id=1,
        )
        self.assertEqual(model.car_make, self.make)
        self.assertEqual(list(self.make.car_models.all()), [model])
        self.assertEqual(str(self.make), "Toyota")
        self.assertEqual(str(model), "Toyota Corolla (2023)")
        self.make.delete()
        self.assertFalse(CarModel.objects.filter(pk=model.pk).exists())

    def test_model_validation_rejects_invalid_choices_years_and_dealer_ids(self):
        for field, value in (("type", "Truck"), ("year", 2014), ("year", 2024), ("dealer_id", 0)):
            with self.subTest(field=field, value=value):
                model = CarModel(
                    car_make=self.make, name="Corolla", type="Sedan", year=2023, dealer_id=1,
                )
                setattr(model, field, value)
                with self.assertRaises(ValidationError) as error:
                    model.full_clean()
                self.assertIn(field, error.exception.message_dict)


class GetCarsTests(TestCase):
    def test_empty_database_returns_empty_list_without_populating(self):
        response = self.client.get(reverse("djangoapp:getcars"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"CarModels": []})
        self.assertEqual(CarMake.objects.count(), 0)
        self.assertEqual(CarModel.objects.count(), 0)

    def test_returns_all_models_and_correct_makes_in_one_query(self):
        initiate()
        with self.assertNumQueries(1):
            response = self.client.get(reverse("djangoapp:getcars"))
        self.assertEqual(response.status_code, 200)
        cars = response.json()["CarModels"]
        self.assertEqual(len(cars), 15)
        self.assertEqual(cars, sorted(cars, key=lambda car: (car["CarMake"], car["CarModel"], car["id"])))
        for car in cars:
            self.assertEqual(set(car), {"id", "CarMake", "CarModel"})
            model = CarModel.objects.select_related("car_make").get(pk=car["id"])
            self.assertEqual(car["CarMake"], model.car_make.name)
            self.assertEqual(car["CarModel"], model.name)

    def test_post_is_rejected_without_creating_data(self):
        response = self.client.post(reverse("djangoapp:getcars"))
        self.assertEqual(response.status_code, 405)
        self.assertEqual(CarModel.objects.count(), 0)


class CarAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_superuser(
            username="lab_test_admin", password="test-only-admin-password",
        )
        initiate()

    def test_admin_login_and_logout_with_csrf_protection(self):
        client = Client(enforce_csrf_checks=True)
        login_url = reverse("admin:login")
        client.get(login_url)
        response = client.post(login_url, {
            "username": "lab_test_admin",
            "password": "test-only-admin-password",
            "csrfmiddlewaretoken": client.cookies["csrftoken"].value,
            "next": reverse("admin:index"),
        })
        self.assertRedirects(response, reverse("admin:index"))
        dashboard = client.get(reverse("admin:index"))
        self.assertContains(dashboard, reverse("admin:djangoapp_carmake_changelist"))
        self.assertContains(dashboard, reverse("admin:djangoapp_carmodel_changelist"))

        response = client.post(reverse("admin:logout"), {
            "csrfmiddlewaretoken": client.cookies["csrftoken"].value,
        })
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("_auth_user_id", client.session)
        self.assertRedirects(
            client.get(reverse("admin:index")), f"{login_url}?next=/admin/",
        )

    def test_admin_lists_models_and_make_form_includes_inline_models(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("admin:djangoapp_carmodel_changelist"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["cl"].result_count, 15)
        self.assertContains(response, "Corolla")
        make = CarMake.objects.get(name="Toyota")
        response = self.client.get(reverse("admin:djangoapp_carmake_change", args=[make.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="car_models-TOTAL_FORMS"')
        self.assertContains(response, "Corolla")
