# Build stage
FROM node:18-alpine as builder

# Set working directory
WORKDIR /app

# Copy source files
COPY . .

RUN npm run setup

# Build the application
RUN npm run build

# Run package script to copy server files
RUN npm run package

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/Calling/dist ./dist
COPY --from=builder /app/Calling/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"]
