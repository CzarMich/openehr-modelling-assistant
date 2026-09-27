FROM node:22.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bubblewrap \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global --ignore-scripts @openai/codex@0.157.1
WORKDIR /app/chat
COPY chat/package.json chat/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY chat/src ./src
COPY chat/entrypoint.mjs ./entrypoint.mjs
COPY public/chat /app/public/chat
RUN mkdir -p /data/chat /workspace /home/node/.codex && chown -R node:node /data/chat /workspace /home/node/.codex
USER node
ENV CHAT_PORT=8350
EXPOSE 8350
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:8350/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "entrypoint.mjs"]
