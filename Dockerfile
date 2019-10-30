FROM node:9-slim
ENV PORT 3001
EXPOSE 3001
WORKDIR /usr/src/app
COPY . .
CMD ["npm", "start"]