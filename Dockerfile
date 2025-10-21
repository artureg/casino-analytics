FROM node:20-alpine
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json yarn.lock ./
RUN yarn install

COPY . .

# Create necessary directories
RUN mkdir -p data downloads

CMD ["node", "index.js"]