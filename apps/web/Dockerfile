FROM node:24.5.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public public
COPY src src
ARG VITE_EVIDA_BUILD_ID=container
ENV VITE_EVIDA_BUILD_ID=$VITE_EVIDA_BUILD_ID
RUN npm run build

FROM nginx:1.28-alpine
COPY deploy-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
