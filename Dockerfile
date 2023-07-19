# based on https://nodejs.org/en/docs/guides/nodejs-docker-webapp
FROM node:20.4.0-slim
# FROM node:20-alpine3.17  # <------ does not work with uwebsockets.js without extra work: Error: Error loading shared library ld-linux-x86-64.so.2: No such file or directory

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)

COPY package*.json ./
# If you are building your code for production
# RUN npm ci --omit=dev
RUN npm install

# Bundle app source
COPY . .

RUN npm run build

# Remove node_modules directory
#RUN rm -rf node_modules

# RUN pwd > /usr/src/app/current_directory.txt


EXPOSE 12000
CMD node ./dist/index.js
