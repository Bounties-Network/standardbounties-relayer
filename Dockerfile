FROM node:10.6.0
ENV PORT 8080
EXPOSE 8080
WORKDIR /usr/src/app
COPY . .
CMD ["npm", "start"]