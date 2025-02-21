# Use Node.js LTS (Latest LTS version)
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package.json files
COPY package*.json ./
COPY Server/package*.json ./Server/
COPY Calling/package*.json ./Calling/

# Copy source code
COPY . .

# Install dependencies
RUN npm run setup

# Build both server and client
RUN npm run build

# Copy server build artifacts to Calling/dist (as per your package script)
RUN npm run package

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"]
