from rest_framework import serializers


class GenerationRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField()
