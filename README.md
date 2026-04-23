[![release](https://img.shields.io/github/v/release/Trac-Systems/main_settlement_bus)](https://github.com/Trac-Systems/main_settlement_bus/releases/latest)
[![tag](https://img.shields.io/github/v/tag/Trac-Systems/main_settlement_bus?sort=semver)](https://github.com/Trac-Systems/main_settlement_bus/tags)
[![npm](https://img.shields.io/npm/v/trac-msb)](https://www.npmjs.com/package/trac-msb)
[![license](https://img.shields.io/github/license/Trac-Systems/main_settlement_bus)](https://github.com/Trac-Systems/main_settlement_bus/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-v22.22.0-brightgreen)](https://www.npmjs.com/package/trac-msb)
[![dependabot](https://img.shields.io/badge/dependabot-enabled-brightgreen)](https://github.com/Trac-Systems/main_settlement_bus/security/dependabot)
[![MSB-Unit-Tests](https://github.com/Trac-Systems/main_settlement_bus/actions/workflows/unit-tests.yml/badge.svg?branch=main)](https://github.com/Trac-Systems/main_settlement_bus/actions/workflows/unit-tests.yml)
[![Acceptance Tests](https://github.com/Trac-Systems/main_settlement_bus/actions/workflows/acceptance-tests.yml/badge.svg?branch=main)](https://github.com/Trac-Systems/main_settlement_bus/actions/workflows/acceptance-tests.yml)
# Main Settlement Bus (MSB)

A peer-to-peer crypto validator network to verify and append transactions.

Always follow the guidance in the [Security Policy](SECURITY.md) for release compatibility, upgrade steps, and required follow-up actions.

The MSB leverages the [Pear Runtime and Holepunch](https://pears.com/).

## Prerequisites

Node.js is required to run the application. Before installing Node.js, refer to the official [Node.js documentation](https://nodejs.org) for the latest recommended version and installation instructions. For this project, Node.js v22.22.0 (LTS) and npm 11.6.1 or newer are compatible.

The Pear Runtime CLI is required to run the application. Before installing Pear, refer to the official [Pear documentation](https://docs.pears.com/guides/getting-started) for the latest recommended version and installation instructions. For this project, the latest Pear CLI is compatible.

Install Pear globally:

```sh
npm install -g pear
which pear
```

Docker is optional and only needed for running the containerized RPC node. Before installing Docker, refer to the official [Docker documentation](https://www.docker.com) for the latest recommended version and installation instructions. For running the containerized RPC node, the latest Docker is recommended. Tested with Docker version 28.3.2, build 578ccf6.

## Install from source checkout

Skip this section if you plan to run the Pear-distributed app shown in [Usage](#usage). The steps below are for running MSB from a local repository checkout, contributing, or testing changes.

```shell
git clone -b <tag> --single-branch git@github.com:Trac-Systems/main_settlement_bus.git
cd main_settlement_bus
npm install
```

## Post-install checklist for source checkout

Before running tests, install bare globally:

```sh
npm install -g bare
```

- ✅ `npm run test:unit:all` – confirms the codebase builds and runs under both supported runtimes.
- 📋 `npm run test:acceptance` – optional but recommended before upgrades. This suite spins up in-process nodes and may take a few minutes.
- 🌐 RPC smoke test – start `npm run rpc --host=127.0.0.1 --port=5000 -- --stores-directory smoke-store --network mainnet` in one terminal, then execute `curl -s http://127.0.0.1:5000/v1/fee` from another terminal to verify `/v1` routes respond. Stop the node with `Ctrl+C` once finished.

## Usage

The current recommended way to use MSB for a user is through Pear distribution system which, just like msb, is inherently decentralized. To do so simply run:

```
pear run pear://6rpmo1bsedagn4u56a85nkzkrxcibab53d7sgds7ukn6kfyzgiwy store1
```

It may required to run twice and `TRUST` in order to perform the bootup.

Another way, through project checkout, runtime entry points cover CLI-driven runs (`start`, `rpc`) and `.env`-aware runs (`env`, `env-rpc`). Each section below lists the accepted configuration inputs.

### Startup input validation

Startup input is validated before MSB finishes booting. This applies to direct CLI flags and to the `.env` / inline environment-variable entry points, because those scripts ultimately pass the same runtime flags into `pear run .`.

- `--network` / `NETWORK` must be one of `mainnet`, `development`, `testnet1`, or `testnet` (`testnet` is treated as an alias for `testnet1`).
- `--stores-directory` / `STORES_DIRECTORY` must be a non-empty string.
- `--host` / `MSB_HOST` must be a non-empty string when RPC mode is enabled.
- `--port` / `MSB_PORT` must be an integer in range `1-65535` when RPC mode is enabled.

MSB also validates the high-risk overrideable config values that are normalized into shared runtime state before startup:

- `bootstrap` must be a 32-byte hex string or `Buffer`.
- `channel` must be a string or `Buffer` with length `1-32` bytes.
- `storesDirectory`, `host`, `port`, and `dhtBootstrap` overrides are validated before the node starts.

When one of these values is invalid, startup fails immediately with a field-specific error instead of silently falling back.

### Interactive regular node

#### Regular node with .env file

This variant reads configuration from `.env`:

```
# .env
STORES_DIRECTORY=<stores_directory>
NETWORK=<network>
```

then

```
npm run env
```

The script sources `.env` before invoking program and falls back to `stores` for `STORES_DIRECTORY` and `mainnet` for `NETWORK` when unset.

#### Inline environment variables

```sh
STORES_DIRECTORY=<stores_directory> NETWORK=testnet npm run env
```

This run persists data under `${STORES_DIRECTORY}` (defaults to `stores` under the project root), connects to testnet (defaults to `mainnet`) and is intended for inline or CLI-supplied configuration. Each network will have its own store subfolder to avoid collision. If `.env` exists, it is prioritized over the inline params.

#### CLI flags

```sh
npm run start -- --stores-directory <stores_directory> --network testnet
```

Supported network values are `mainnet`, `development`, `testnet1`, and `testnet` (`testnet` maps to `testnet1`).

### RPC-enabled node

#### RPC with .env file

```
# .env
STORES_DIRECTORY=<stores_directory>
MSB_HOST=127.0.0.1
MSB_PORT=5000
NETWORK=mainnet
```

```
npm run env-rpc
```

This entry point sources `.env` automatically and defaults to `stores`, `127.0.0.1`, `5000`, and `mainnet` when variables are not present. Supported `NETWORK` values are `mainnet`, `development`, `testnet`, and `testnet1`.

#### Inline environment variables

```sh
STORES_DIRECTORY=<stores_directory> MSB_HOST=<host> MSB_PORT=<port> NETWORK=<network> npm run env-rpc
```

Override any combination of `STORES_DIRECTORY`, `MSB_HOST`, `MSB_PORT`, or `NETWORK`. Data is persisted under `<stores_directory>/<store_name>` (default `stores/mainnet` for this script). If `.env` exists, it is sourced first and may override the inline values shown here.

#### CLI flags

```sh
npm run rpc --host=<host> --port=<port> -- --stores-directory <stores_directory> --network <network>
```

Supported network values are `mainnet`, `development`, `testnet1`, and `testnet` (`testnet` maps to `testnet1`). Invalid `--host`, `--port`, `--stores-directory`, or `--network` values fail before the RPC node starts.

## Docker usage

For local Docker usage, build from `dockerfile`. The provided `docker-compose.yml` defines the `msb-rpc` service and is intended for the RPC node. The separate `dockerfile.deploy` is used by the release workflow.

The most relevant variables are:

- `MSB_STORE`: store root under `./stores`. With `MSB_STORE=rpc-node-store` and `NETWORK=mainnet`, data is written under `./stores/rpc-node-store/mainnet`.
- `MSB_HOST`: host interface to bind. Defaults to `127.0.0.1`. Use an IP address such as `127.0.0.1`; `localhost` is rejected by Docker Compose port mappings.
- `MSB_PORT`: RPC port inside the container. Defaults to `5000`.
- `MSB_PUBLISH_PORT`: host port to expose. Defaults to `MSB_PORT`.
- `NETWORK`: network environment. Supported values are `mainnet`, `development`, `testnet`, and `testnet1`.

### Build the image

```sh
docker compose build msb-rpc
```

If you want to run the image with plain `docker run`, build it with an explicit tag:

```sh
docker build -t msb-rpc -f dockerfile .
```

### Run the RPC service

```sh
MSB_STORE=rpc-node-store \
MSB_HOST=127.0.0.1 \
MSB_PORT=5000 \
MSB_PUBLISH_PORT=6000 \
NETWORK=mainnet \
docker compose up -d msb-rpc
```

Stop it with `docker compose stop msb-rpc` or remove it with `docker compose down`.

> Note: In RPC mode the node still needs time to synchronize with the network before it is fully ready.

## Troubleshooting

- **Dependency install failures** – confirm you are on Node.js v22.22.0 (LTS) and npm ≥ 11.6.1. If packages still fail to build, clear artifacts (`rm -rf node_modules package-lock.json && npm install`) and rerun `npm run test:unit:all`.
- **Unit tests fail only in one runtime** – run the targeted commands (`npm run test:unit:node` or `npm run test:unit:bare`) to isolate regressions, then inspect `tests/unit/unit.test.js` for the failing cases.

## Development

### VS Code

Open the repository root in VS Code so the editor can resolve the local `eslint` dependency, the root `eslint.config.js`, and the existing debugger launch configurations in `.vscode/launch.json`.

Install these extensions:

- `dbaeumer.vscode-eslint` (microsoft.com)

For linting, add the following to your workspace or user `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": false,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.useFlatConfig": true,
  "eslint.workingDirectories": [
    {
      "mode": "auto"
    }
  ],
  "[javascript]": {
    "editor.defaultFormatter": "dbaeumer.vscode-eslint"
  }
}
```

### Linting and tests

Use these commands during development:

- `npm run lint` checks the full repository with ESLint.
- `npm run lint:fix` applies ESLint autofixes where possible.
- `npm run test:unit:all` runs both unit suites and is the main pre-commit test command.
- `npm run test:acceptance` runs the RPC acceptance test suite.
