FROM node:24-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# The dummy database URL only lets the prisma config load; nothing connects to a database here
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma generate --config prisma7.config.ts
EXPOSE 8000
CMD ["npx", "tsx", "index.ts"]
