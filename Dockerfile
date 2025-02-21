###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:18-alpine As development

RUN npm run setup

RUN npm run start
