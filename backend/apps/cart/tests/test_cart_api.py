from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from rest_framework import status
from apps.products.models import Product, Brand, Category, SubCategory
from apps.cart.models import Cart 

User = get_user_model()


class CartAPITest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@test.com",
            name="Test",
            password='test123'
        )

        self.client.force_authenticate(user=self.user)

        brand = Brand.objects.create(name="Nike")
        category = Category.objects.create(name="Shoes")
        subcategory = SubCategory.objects.create(name="Running")

        self.product = Product.objects.create(
            name="Air Zoom",
            brand=brand,
            category=category,
            subcategory=subcategory,
            price=100,
            stock=10,
            in_stock=True
        )

    def test_add_product_to_cart(self):
        response = self.client.post(
            "/api/cart/add/",
            {"product_id": self.product.id, "quantity": 1,'size':6}
        )
        print(response.data)  

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_get_cart_creates_cart(self):
        response = self.client.get("/api/cart/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(Cart.objects.filter(user=self.user).exists())

    def test_add_same_product_increments_quantity(self):
        data = {
            "product_id": self.product.id,
            "size": 42,
            "quantity": 1
        }
        self.client.post("/api/cart/add/", data)
        self.client.post("/api/cart/add/", data)

        response = self.client.get("/api/cart/")
        self.assertEqual(response.data["items"][0]["quantity"], 2)

    
    def test_update_cart_item(self):
        self.client.post("/api/cart/add/", {
            "product_id": self.product.id,
            "size": 42,
            "quantity": 1
        })

        cart = Cart.objects.get(user=self.user)
        item = cart.items.first()

        response = self.client.patch(
            f"/api/cart/item/{item.id}/",
            {"quantity": 5}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"][0]["quantity"], 5)

    def test_remove_cart_item(self):
        self.client.post("/api/cart/add/", {
            "product_id": self.product.id,
            "size": 42,
            "quantity": 1
        })

        cart = Cart.objects.get(user=self.user)
        item = cart.items.first()

        response = self.client.delete(f"/api/cart/item/{item.id}/remove/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 0)

    def test_clear_cart(self):
        self.client.post("/api/cart/add/", {
            "product_id": self.product.id,
            "size": 42,
            "quantity": 1
        })

        response = self.client.delete("/api/cart/clear/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 0)

    def test_unauthorized_cart_access(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/cart/")
        self.assertEqual(response.status_code, 401)
        

    def test_cannot_add_out_of_stock_product(self):
        self.product.stock = 0
        self.product.save()

        response = self.client.post("/api/cart/add/", {
            "product_id": self.product.id,
            "size": 42,
            "quantity": 1
        })

        self.assertEqual(response.status_code, 400)