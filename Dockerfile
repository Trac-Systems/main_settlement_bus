# This is required because sodium-native uses GLIBC_2.33, if they update, we will need to use another
FROM node:24-bookworm

WORKDIR /app

COPY package*.json package-lock.json ./

RUN apt-get update && apt-get install -y build-essential python3 libatomic1 vim

RUN npm install

RUN npm i -g pear

COPY . .

# This is just to actually run the installer once
RUN pear run -d .

# This is pretty bs
RUN export PATH="/root/.config/pear/bin:$PATH"

CMD ["pear","run","-d","."]
