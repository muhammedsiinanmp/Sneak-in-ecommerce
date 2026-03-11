from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = "Create default admin user"

    def handle(self, *args, **options):
        if not User.objects.filter(email="admin@sneakin.com").exists():
            User.objects.create_superuser(
                email="admin@sneakin.com", name="Admin", password="admin123"
            )
            self.stdout.write(
                self.style.SUCCESS("Admin created : admin@sneakin.com / admin123")
            )
        else:
            self.stdout.write("Admin already exists")
