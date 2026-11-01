FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src

# SQLite 落在 /data（bind mount 到 deployment_datas/）
VOLUME ["/data"]

CMD ["node", "src/index.js"]
