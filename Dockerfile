FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=8080

COPY package.json ./
COPY README.md ./
COPY server.mjs ./
COPY src ./src

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
