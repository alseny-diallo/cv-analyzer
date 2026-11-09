FROM node:22.23.4-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY tsconfig*.json ./
COPY src ./src
RUN yarn build

FROM node:22.23.4-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn workspaces focus --production && yarn cache clean --all
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3043
CMD ["node", "dist/main.js"]
