FROM python:3.10-slim

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

RUN mkdir -p /data/artifacts /data/work /opt/providers \
    && chown -R 65532:65532 /data /opt/providers

USER 65532:65532
EXPOSE 8010
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
