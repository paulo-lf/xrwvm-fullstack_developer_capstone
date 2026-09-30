FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY app.js inventory.js ./
COPY data/car_records.json ./data/car_records.json

USER node

EXPOSE 3050

CMD ["node", "app.js"]
