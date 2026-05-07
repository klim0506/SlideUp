from django.urls import path

from .views import GenerateOutlineView


urlpatterns = [
    path("outline/", GenerateOutlineView.as_view(), name="generate-outline"),
]
