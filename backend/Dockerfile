#building
FROM node:24-slim as build
RUN apt-get update && apt-get instal -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma generate --config prisma7.config.ts
RUN npm run build
#migrate
FROM build as migrate
CMD ["npx","prisma","migrate","deploy","--config","prisma7.config.ts"]
#Runtime

FROM node:24-slim as runtime
RUN apt-get update && apt-get install -y openss && rm /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8000
CMD ["node","dist/index.js"]