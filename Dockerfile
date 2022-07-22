# syntax=docker/dockerfile:1
FROM node:12-alpine
RUN apk add --no-cache python2 g++ make
WORKDIR /app
COPY . .
RUN npm install --production
CMD ["node", "dist/index.js"]
EXPOSE 3000
