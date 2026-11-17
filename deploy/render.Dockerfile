# Single-container image for Render's free plan: Next.js (public port) + FastAPI + worker.
# The regular Docker setup (compose.yml) keeps them as separate containers.
FROM node:24-slim AS web
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web ./
RUN npm run build

FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.28 /uv /bin/uv
COPY --from=web /usr/local/bin/node /usr/local/bin/node
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 \
    NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=10000 \
    API_INTERNAL_URL=http://127.0.0.1:8000

WORKDIR /app
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/api/alembic.ini ./
COPY apps/api/migrations ./migrations
COPY apps/api/app ./app

COPY --from=web /web/.next/standalone /web
COPY --from=web /web/.next/static /web/.next/static
COPY --from=web /web/public /web/public
COPY deploy/render-start.sh /render-start.sh

RUN useradd --system --uid 10001 app && mkdir -p /data/media && chown -R app /data/media /web
USER app
EXPOSE 10000
CMD ["bash", "/render-start.sh"]
