FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc -p tsconfig.json

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
