# Dockerfile for Tower of Babble Backend
# Multi-stage build: development vs production

# ============================================
# Development Stage
# ============================================
FROM node:18-alpine AS development

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3004

# Development command (with hot reload)
CMD ["npm", "run", "dev"]

# ============================================
# Production Build Stage
# ============================================
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# ============================================
# Production Stage
# ============================================
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built artifacts from build stage
COPY --from=build /app/dist ./dist

# Expose port
EXPOSE 3004

# Production command
CMD ["npm", "run", "start"]