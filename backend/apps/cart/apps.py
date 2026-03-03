from django.apps import AppConfig


class CartConfig(AppConfig):
    name = 'apps.cart'

    def ready(self):
        import apps.cart.signals 
