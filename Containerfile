FROM docker.io/library/node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
WORKDIR /app
COPY package.json server.mjs shop.test.mjs ./
RUN node --check server.mjs
ENV PORT=18080
CMD ["node", "server.mjs"]
