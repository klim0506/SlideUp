FROM node:20-alpine

WORKDIR /app

COPY frontend/package*.json /app/
RUN npm install

COPY frontend /app
COPY shared /shared
