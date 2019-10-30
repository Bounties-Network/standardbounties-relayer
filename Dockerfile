FROM node:12.13.0
ENV PORT 3001
EXPOSE 3001
WORKDIR /usr/src/app
COPY . .
RUN "npm rebuild"
CMD ["npm", "start"]