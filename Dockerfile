FROM node:22-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

# Copy application code and data.
COPY server.js ./
COPY data ./data

ENV PORT=8080
EXPOSE 8080

# Run as the non-root user that ships with the node image.
USER node

CMD ["node", "server.js"]
