FROM node:20-bookworm-slim

WORKDIR /app

COPY sim-core ./sim-core
COPY Enums.js ./Enums.js
COPY utils/database ./utils/database
COPY data ./data
COPY simulation-runner ./simulation-runner

WORKDIR /app/simulation-runner

RUN npm install --omit=dev

CMD ["node", "src/index.js"]
