FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends libatomic1 \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pear

USER node

WORKDIR /app

RUN pear
ENV PATH="/home/node/.config/pear/bin:${PATH}"

COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV MSB_STORE=node-store \
    MSB_HOST=0.0.0.0 \
    MSB_PORT=5000

VOLUME ["/app/stores"]
EXPOSE 5000

#ENTRYPOINT ["npm", "run"]
#CMD ["env-prod-rpc"]
CMD ["tail", "-f", "/dev/null"]
