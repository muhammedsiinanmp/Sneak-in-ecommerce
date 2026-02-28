import json
from django.core.management.base import BaseCommand
from apps.products.models import (
    Brand,
    Category,
    SubCategory,
    Product,
    ProductImage,
    ProductSize,
)


class Command(BaseCommand):
    help = "Seed products from db.json"

    def add_arguments(self, parser):
        parser.add_argument("--file", type=str, default="db.json")

    def handle(self, *args, **options):
        with open(options["file"], "r") as f:
            data = json.load(f)
        for item in data.get("products", []):
            brand, _ = Brand.objects.get_or_create(name=item["brand"])
            category, _ = Category.objects.get_or_create(name=item["category"])
            subcategory, _ = SubCategory.objects.get_or_create(
                name=item.get("subcategory", "Other")
            )
            product, created = Product.objects.get_or_create(
                name=item["name"],
                defaults={
                    "brand": brand,
                    "category": category,
                    "subcategory": subcategory,
                    "price": item["price"],
                    "mrp": item.get("mrp"),
                    "description": item.get("description", ""),
                    "release_date": item.get("releaseDate"),
                    "bestseller": item.get("bestseller", False),
                    "in_stock": item.get("inStock", True),
                    "stock": item.get("stock", 0),
                },
            )
            if created:
                for i, url in enumerate(item.get("image", [])):
                    ProductImage.objects.create(
                        product=product, image_url=url, display_order=i
                    )
                for size in item.get("sizes", []):
                    ProductSize.objects.create(
                        product=product, size_value=size, stock=5
                    )
                self.stdout.write(f"  ✓ {product.name}")
        self.stdout.write(
            self.style.SUCCESS(f"Seeded {Product.objects.count()} products")
        )
