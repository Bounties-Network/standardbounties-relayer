FROM node:10.6.0
ENV PORT 3001
EXPOSE 3001
WORKDIR /usr/src/app
COPY . .
CMD ["npm", "start"]