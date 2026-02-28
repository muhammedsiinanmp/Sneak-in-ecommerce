from django.db import models


class Brand(models.Model):
    name = models.CharField(max_length=100,unique=True)
    logo_url = models.URLField(blank=True)

    def __str__(self):
        return self.name
    
class Category(models.Model):
    name = models.CharField(max_length=50,unique=True)

    class Meta:
        verbose_name_plural = 'categories'
    def __str__(self):
        return self.name

class SubCategory(models.Model):
    name = models.CharField(max_length=50,unique=True)

    class Meta:
        verbose_name_plural = 'subcategories'
    def __str__(self):
        return self.name
    
class Product(models.Model):
    name = models.CharField(max_length=255)
    brand = models.ForeignKey(Brand,on_delete=models.CASCADE,related_name='products')
    category = models.ForeignKey(Category,on_delete=models.CASCADE,related_name='products')
    subcategory = models.ForeignKey(SubCategory,on_delete=models.CASCADE,related_name='products')
    price = models.DecimalField(max_digits=10,decimal_places=2)
    mrp = models.DecimalField(max_digits=10,decimal_places=2,null=True)
    description = models.TextField(blank=True)
    release_date = models.DateField(null=True, blank=True)
    bestseller = models.BooleanField(default=False)
    in_stock = models.BooleanField(default=True)
    stock = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    product = models.ForeignKey(Product,on_delete=models.CASCADE,related_name='images')
    image_url = models.URLField()
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['display_order']

class ProductSize(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='sizes')
    size_value = models.PositiveIntegerField()
    stock = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ['product','size_value']
