FROM node:24-slim
RUN npm install -g pnpm@12.4.1
WORKDIR /app
COPY . .
# Next bakes rewrites at build time, so the API address is a build argument.
ARG API_URL=http://api:4000
# The build's id (the commit; empty: the build's start time), baked in for the new-version check.
ARG BUILD_ID=""
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile --filter @fabulka/web... \
 && pnpm --filter @fabulka/web build
WORKDIR /app/apps/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "--port", "3000"]
