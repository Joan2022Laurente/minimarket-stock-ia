FROM python:3.12-slim@sha256:191083cdf6c7bda8c76158983163ead5d5cf7b77cf3033e805bb0f5296f51b4b AS builder

WORKDIR /build
ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m venv "$VIRTUAL_ENV" \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip check \
    && python -m pip freeze

FROM python:3.12-slim@sha256:191083cdf6c7bda8c76158983163ead5d5cf7b77cf3033e805bb0f5296f51b4b AS runtime

WORKDIR /app
ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends libpq5 libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 appgroup \
    && useradd --uid 10001 --gid appgroup --no-create-home --shell /usr/sbin/nologin appuser

COPY --from=builder /opt/venv /opt/venv
COPY app/ /app/app/
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/minimarket-entrypoint
RUN install -d -o appuser -g appgroup /app/app/ml/artifacts /app/uploads

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3).close()"]

ENTRYPOINT ["minimarket-entrypoint"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

FROM runtime AS test

USER root
COPY requirements*.txt /tmp/requirements/
RUN python -m pip install --no-cache-dir -r /tmp/requirements/requirements-dev.txt \
    && python -m pip check \
    && rm -rf /tmp/requirements
COPY tests/ /app/tests/
USER appuser
ENV ENVIRONMENT=test \
    DATABASE_URL="" \
    AWS_EC2_METADATA_DISABLED=true \
    ML_MODEL_PATH=/tmp/minimarket-ml/model_latest.joblib \
    ML_METADATA_PATH=/tmp/minimarket-ml/model_metadata.json \
    OMP_NUM_THREADS=2 \
    OMP_THREAD_LIMIT=2
CMD ["python", "-m", "pytest", "-p", "no:cacheprovider", "-q"]

FROM runtime AS final
