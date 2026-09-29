from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from djangoapp.models import CarMake, CarModel
from djangoapp.populate import initiate


class Command(BaseCommand):
    help = "Add the lab's five makes and fifteen models, preserving existing records."

    def handle(self, *args, **options):
        try:
            created = initiate()
        except ValidationError as exc:
            raise CommandError(f"Sample data was not saved: {exc}") from exc

        self.stdout.write(self.style.SUCCESS(
            f"Created {created['makes']} car makes and {created['models']} car models. "
            f"Database now contains {CarMake.objects.count()} car makes and "
            f"{CarModel.objects.count()} car models."
        ))
