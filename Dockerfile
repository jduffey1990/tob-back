# Simple single-stage Dockerfile
FROM node:18-alpine

WORKDIR /app

# 1. Copy package.json and lock
COPY package*.json ./

# 2. Install ALL dependencies (including dev), so we have tsc and ts-node
RUN npm install

# 3. Copy the rest of the code
COPY . .

# 4. Build TypeScript (puts compiled .js into dist/)
RUN npm run build

# 5. Expose the port (just for clarity)
EXPOSE 3000

# 6. Default command: start the server
CMD ["npm", "run", "start"]

    