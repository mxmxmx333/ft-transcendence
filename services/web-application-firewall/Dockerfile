FROM nginx:stable

# removing default nginx content
RUN rm -rf /usr/share/nginx/html/*

COPY ./configs/nginx.conf /etc/nginx/nginx.conf

COPY ./html /usr/share/nginx/html

EXPOSE 333

CMD ["nginx", "-g", "daemon off;"]

