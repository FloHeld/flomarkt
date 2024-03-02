FROM node:17

WORKDIR /usr/src/app

COPY package.json ./

RUN npm install

COPY . .

EXPOSE 7003

CMD ["npm", "start"]
