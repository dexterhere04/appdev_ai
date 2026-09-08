FROM ghcr.io/cirruslabs/flutter:3.41.5
ENV FLUTTER_HOME=/sdks/flutter
ENV PATH="$FLUTTER_HOME/bin:$FLUTTER_HOME/bin/cache/dart-sdk/bin:$PATH"

# Python for the FastAPI backend (Flutter/Dart are already on PATH in this image)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Dedicated venv (Ubuntu python3 is PEP-668 externally-managed)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Core python deps first (fastapi/uvicorn/etc.) so they cache independently
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Application source last
COPY . .

EXPOSE 5000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5000"]
