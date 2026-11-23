FROM python:3.13-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py converter.py repair_odt_tables.py ./
RUN useradd --create-home converter && mkdir /app/data && chown converter:converter /app/data
USER converter
ENV BIND_HOST=0.0.0.0 PORT=8765 DATA_DIR=/app/data
EXPOSE 8765
CMD ["python", "-X", "utf8", "server.py"]
