# TWIN Entity Storage Connector PostgresSql

Entity Storage connector implementation using PostgresSql storage.

## Installation

```shell
npm install @twin.org/entity-storage-connector-postgressql
```

## Testing

The tests developed are functional tests and need an instance of PostgresSql up and running. To run PostgresSql locally:

```sh
docker run -p 5432:5432 --name twin-entity-storage-postgresql --hostname postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -d postgres
```

Afterwards you can run the tests as follows:

```sh
npm run test
```

## Examples

Usage of the APIs is shown in the examples [docs/examples.md](docs/examples.md)

## Reference

Detailed reference documentation for the API can be found in [docs/reference/index.md](docs/reference/index.md)

## Changelog

The changes between each version can be found in [docs/changelog.md](docs/changelog.md)
