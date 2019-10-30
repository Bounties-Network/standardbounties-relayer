FROM node:10.16.3
ENV PORT 3001
EXPOSE 3001
WORKDIR /usr/src/app
COPY . .
CMD ["npm", "start"]
