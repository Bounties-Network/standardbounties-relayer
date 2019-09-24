FROM node:10.6.0
ENV PORT 3000
EXPOSE 3000
WORKDIR /usr/src/app
COPY . .
CMD ["npm", "start"]