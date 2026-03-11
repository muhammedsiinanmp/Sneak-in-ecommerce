from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from decouple import config

User = get_user_model()


class Command(BaseCommand):
    help = "Create a default admin user if none exists"

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            type=str,
            default=config("ADMIN_EMAIL", default="admin@sneakin.com"),
        )
        parser.add_argument(
            "--name",
            type=str,
            default=config("ADMIN_NAME", default="Admin"),
        )
        parser.add_argument(
            "--password",
            type=str,
            default=config("ADMIN_PASSWORD", default="admin123456"),
        )

    def handle(self, *args, **options):
        email = options["email"]
        name = options["name"]
        password = options["password"]

        if User.objects.filter(email=email).exists():
            self.stdout.write(self.style.WARNING(f"Admin user {email} already exists."))
            return

        user = User.objects.create_user(
            email=email,
            name=name,
            password=password,
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.stdout.write(self.style.SUCCESS(f"Admin user created: {user.email}"))
