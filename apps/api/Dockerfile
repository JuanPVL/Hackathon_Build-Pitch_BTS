# Quadra API — imagen para Google Cloud Run (también sirve en Railway).
# Multi-stage: compila con dependencias de desarrollo y la imagen final solo lleva dist/ y
# dependencias de producción. Ningún .env ni secreto entra a la imagen (ver .dockerignore):
# las variables y los secretos los inyecta Cloud Run (--set-env-vars / --set-secrets).
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
# main.ts escucha en process.env.PORT (por defecto 8080) y 0.0.0.0.
CMD ["node", "dist/main.js"]
