import pytest
from django.core.management import call_command

from apps.products.models import Product


@pytest.mark.django_db
class TestSeedProductsCommand:
    """Tests for the seed_products management command"""

    def test_seeds_catalog_from_bundled_fixture(self):
        call_command("seed_products")
        assert Product.objects.count() == 20
        product = Product.objects.get(name="Adidas Forum 84 High Off-White Dark Green")
        assert product.images.count() >= 1
        assert product.sizes.count() == 4

    def test_running_twice_does_not_duplicate_products(self):
        call_command("seed_products")
        call_command("seed_products")
        assert Product.objects.count() == 20
