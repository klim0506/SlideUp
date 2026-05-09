FROM python:3.12-slim-bookworm

# weasyprint system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    libjpeg62-turbo \
    zlib1g \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install Claude CLI
RUN curl -fsSL https://claude.ai/install.sh | bash && ln -sf /root/.local/bin/claude /usr/local/bin/claude

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
