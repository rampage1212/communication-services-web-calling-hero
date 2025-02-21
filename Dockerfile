###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:18-alpine As development

RUN npm setup

RUN npm start
