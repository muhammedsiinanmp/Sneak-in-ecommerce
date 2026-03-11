import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.products.models import Brand, Category, SubCategory, Product, ProductImage
from apps.orders.models import Order, OrderItem

User = get_user_model()


@pytest.fixture
def admin_user(db):
    """Create and return an admin user."""
    return User.objects.create_user(
        email="admin@test.com",
        name="Admin User",
        password="admin123456",
        role="admin",
        is_staff=True,
    )


@pytest.fixture
def regular_user(db):
    """Create and return a regular user."""
    return User.objects.create_user(
        email="user@test.com",
        name="Regular User",
        password="user123456",
        role="user",
    )


@pytest.fixture
def admin_client(admin_user):
    """Return an authenticated API client for admin user."""
    client = APIClient()
    refresh = RefreshToken.for_user(admin_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def user_client(regular_user):
    """Return an authenticated API client for regular user."""
    client = APIClient()
    refresh = RefreshToken.for_user(regular_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def unauthenticated_client():
    """Return an unauthenticated API client."""
    return APIClient()


@pytest.fixture
def sample_brand(db):
    return Brand.objects.create(name="Nike", logo_url="https://example.com/nike.png")


@pytest.fixture
def sample_category(db):
    return Category.objects.create(name="Running")


@pytest.fixture
def sample_subcategory(db):
    return SubCategory.objects.create(name="Trail Running")


@pytest.fixture
def sample_product(db, sample_brand, sample_category, sample_subcategory):
    product = Product.objects.create(
        name="Air Max 90",
        brand=sample_brand,
        category=sample_category,
        subcategory=sample_subcategory,
        price=12999.00,
        mrp=15999.00,
        description="Classic sneaker",
        in_stock=True,
        stock=50,
    )
    ProductImage.objects.create(
        product=product,
        image_url="https://example.com/airmax.jpg",
        display_order=0,
    )
    return product


@pytest.fixture
def sample_order(db, regular_user, sample_product):
    order = Order.objects.create(
        user=regular_user,
        status="pending",
        payment_method="cod",
        total_amount=12999.00,
        shipping_address="123 Test Street",
    )
    OrderItem.objects.create(
        order=order,
        product=sample_product,
        product_name=sample_product.name,
        product_image="https://example.com/airmax.jpg",
        size=42,
        quantity=1,
        price=12999.00,
    )
    return order
