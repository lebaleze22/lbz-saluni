FROM nginx:1.27-alpine

COPY nginx/local.conf /etc/nginx/conf.d/default.conf
