# The production image: podman build -t on-track .
# Settings (DATABASE_URL, BETTER_AUTH_*, OAuth, SMTP) are given at run time, not
# built in, so one image works for any installation.

FROM docker.io/library/node:26-slim AS build
COPY --from=docker.io/oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build \
  && bun build scripts/migrate.ts --target=node --outfile=dist/migrate.mjs

FROM docker.io/library/node:26-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist/migrate.mjs ./migrate.mjs

USER node
EXPOSE 3000

# Update the database schema, then start the app
CMD ["sh", "-c", "node migrate.mjs && exec node server.js"]
