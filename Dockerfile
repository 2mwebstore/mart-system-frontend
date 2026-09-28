# Dev image: Vite dev server. Source is bind-mounted over /app by
# docker-compose (node_modules stays the image's own copy).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 80
CMD ["npm", "run", "dev"]
