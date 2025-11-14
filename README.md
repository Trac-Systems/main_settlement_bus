# Main Settlement Bus (MSB)

A peer-to-peer crypto validator network to verify and append transactions.

Always follow the guidance in the [Security Policy](SECURITY.md) for release compatibility, upgrade steps, and required follow-up actions.

The MSB leverages the [Pear Runtime and Holepunch](https://pears.com/).

## Prerequisites

Node.js is required to run the application. Before installing Node.js, refer to the official [Node.js documentation](https://nodejs.org) for the latest recommended version and installation instructions. For this project, Node.js v24.11.0 (LTS) and npm 11.6.1 or newer are compatible.

The Pear Runtime CLI is required to run the application. Before installing Pear, refer to the official [Pear documentation](https://docs.pears.com/guides/getting-started) for the latest recommended version and installation instructions. For this project, the latest Pear CLI is compatible.

Install Pear globally:

```sh
npm install -g pear
which pear
```

Docker is optional and only needed for running the containerized RPC node. Before installing Docker, refer to the official [Docker documentation](https://www.docker.com) for the latest recommended version and installation instructions. For running the containerized RPC node, the latest Docker is recommended. Tested with Docker version 28.3.2, build 578ccf6.

## Install

```shell
git clone -b main --single-branch git@github.com:Trac-Systems/main_settlement_bus.git
cd main_settlement_bus
npm install
```

## Post-install checklist

- ✅ `npm run test:unit:all` – confirms the codebase builds and runs under both supported runtimes.
- 📋 `npm run test:acceptance` – optional but recommended before upgrades. This suite spins up in-process nodes and may take a few minutes.
- 🌐 RPC smoke test – start `MSB_STORE=smoke-store MSB_HOST=127.0.0.1 MSB_PORT=5000 npm run env-prod-rpc` in one terminal, then execute `curl -s http://127.0.0.1:5000/v1/fee` from another terminal to verify `/v1` routes respond. Stop the node with `Ctrl+C` once finished.

## Usage

Runtime entry points cover CLI-driven runs (`prod`, `prod-rpc`) and `.env`-aware runs (`env-prod`, `env-prod-rpc`). Each section below lists the accepted configuration inputs.

### Interactive regular node

#### Regular node with .env file

This variant reads configuration from `.env`:

```
# .env
MSB_STORE=<store_name>
```
then 
```
npm run env-prod
```

The script sources `.env` before invoking program and falls back to `node-store` when `MSB_STORE` is not defined.

#### Inline environment variables ####

```sh
MSB_STORE=<store_name> npm run env-prod
```

This run persists data under `./stores/${MSB_STORE}` (defaults to `node-store`) and is intended for inline or CLI-supplied configuration.

#### CLI flags

```sh
npm run prod --store=<store_name>
```

### RPC-enabled node

#### RPC with .env file
```
# .env
MSB_STORE=<store_name>
MSB_HOST=0.0.0.0
MSB_PORT=5000
```

```
npm run env-prod-rpc
```

This entry point sources `.env` automatically and defaults to `rpc-node-store`, `0.0.0.0`, and `5000` when variables are not present.

#### Inline environment variables

```sh
MSB_STORE=<store_name> MSB_HOST=<host> MSB_PORT=<port> npm run prod-rpc
```

Override any combination of `MSB_STORE`, `MSB_HOST`, or `MSB_PORT`. Data is persisted under `./stores/${MSB_STORE}` (default `rpc-node-store` for this script).

#### CLI flags

```sh
npm run prod-rpc --store=<store_name> --host=<host> --port=<port>
```

## Docker usage

You can run the RPC node in a containerized environment using the provided `docker-compose.yml` file.

The provided `docker-compose.yml` uses the Pear-backed `npm run env-prod-rpc` entry point; the container image pre-installs the Pear CLI and bootstraps the runtime automatically when it first starts.

### Running `msb-rpc` with Docker Compose

The `msb-rpc` service uses the local `./stores` folder (mounted into `/app/stores`) and the environment variables `MSB_STORE`, `MSB_HOST`, and `MSB_PORT`. Any of the following launch methods can be applied:

1. **Using a `.env` file** – populate `.env`, then start the service:

   ```sh
   docker compose --env-file .env up -d msb-rpc
   ```

   Follow the logs with `docker compose logs -f msb-rpc` to ensure the node is healthy.

2. **Passing variables inline** – use this method when environment variables should be provided directly in the command line, without modifying the `.env` file:

   ```sh
   MSB_STORE=<store_name> MSB_HOST=<host> MSB_PORT=<port> docker compose up -d msb-rpc
   ```

3. **Reusing an existing store directory** – mount the path that already holds your store:

   ```sh
   docker compose run -d --name msb-rpc \
      -e MSB_STORE=<store_name> \
      -e MSB_HOST=<host> \
      -e MSB_PORT=<port> \
      -p <port>:<port> \
      -v /absolute/path/to/your/stores:/app/stores \
      msb-rpc
   ```

   Adjust `/absolute/path/to/your/stores` to the directory that already contains the persisted store. Once the container exists, bring it back with `docker compose start msb-rpc`.

Stop the service with `docker compose stop msb-rpc`, remove the stack entirely with `docker compose down` when you are finished.

> Note: The RPC instance must synchronize with the network after startup, so full readiness may take some time.

## Troubleshooting

- **Dependency install failures** – confirm you are on Node.js v24.11.0 (LTS) and npm ≥ 11.6.1. If packages still fail to build, clear artifacts (`rm -rf node_modules package-lock.json && npm install`) and rerun `npm run test:unit:all`.
- **Unit tests fail only in one runtime** – run the targeted commands (`npm run test:unit:node` or `npm run test:unit:bare`) to isolate regressions, then inspect `tests/unit/unit.test.js` for the failing cases.
- **RPC port already in use** – set `MSB_PORT` to a free value (for example `MSB_PORT=5050 npm run prod-rpc --port=5050`) or free the port with `lsof -i :<port>` as needed.
- **Docker container exits immediately** – check `docker compose logs -f msb-rpc` for missing volume permissions or environment variables; the service requires the mounted `./stores` directory to be writable by the container user.
