FROM node:22-alpine AS dependencies
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=dependencies /app/apps/api/node_modules ./node_modules
COPY apps/api/package.json apps/api/package-lock.json ./
COPY apps/api/src ./src
COPY apps/api/migrations ./migrations
COPY --chmod=0755 contracts /app/contracts
RUN find /app/contracts -type f -exec chmod 0644 {} +
USER node
EXPOSE 3000
CMD ["node", "src/server.mjs"]
