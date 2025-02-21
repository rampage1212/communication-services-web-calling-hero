###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:18-alpine As development

# Set working directory
WORKDIR /app

# Copy package.json files
COPY package*.json ./
COPY Server/package*.json ./Server/
COPY Calling/package*.json ./Calling/

# Copy all other source code files
COPY . .

# Install dependencies and build
RUN npm run setup
CMD ["npm", "run", "start"]