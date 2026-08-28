FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
# A clean container has no prebuilt workspace outputs. Build the TypeScript
# project-reference graph first so workspace packages compile in dependency
# order before the per-workspace production build runs.
RUN npm run typecheck -- --force
RUN npm run build

FROM node:22-alpine AS api
ENV NODE_ENV=production
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
WORKDIR /app
RUN apk add --no-cache chromium font-noto-cjk
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
USER node
EXPOSE 4310
CMD ["node", "apps/api/dist/server.js"]

FROM node:22-alpine AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/packages ./packages
USER node
CMD ["node", "apps/worker/dist/index.js"]

FROM nginx:1.27-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080

# Keep the combined API + Worker image as the final stage so hosts that do not
# expose Docker target selection build the correct runtime by default.
FROM api AS hosted
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/scripts ./scripts
CMD ["node", "scripts/start-hosted.mjs"]
