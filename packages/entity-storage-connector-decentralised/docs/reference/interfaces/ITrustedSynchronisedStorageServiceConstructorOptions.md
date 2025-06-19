# Interface: ITrustedSynchronisedStorageServiceConstructorOptions

Options for the Synchronised Storage Service constructor.

## Extended by

- [`ISynchronisedStorageServiceConstructorOptions`](ISynchronisedStorageServiceConstructorOptions.md)

## Properties

### entitySchema

> **entitySchema**: `string`

The name of the entity schema.

***

### entityStorageConnectorType

> **entityStorageConnectorType**: `string`

The entity storage connector type to use for actual data.

***

### syncSnapshotStorageConnectorType?

> `optional` **syncSnapshotStorageConnectorType**: `string`

The entity storage connector type to use for sync snapshots.

#### Default

```ts
sync-snapshot-entry
```

***

### blobStorageComponentType?

> `optional` **blobStorageComponentType**: `string`

The blob storage component used for remote sync state.

#### Default

```ts
blob-storage
```

***

### verifiableStorageConnectorType?

> `optional` **verifiableStorageConnectorType**: `string`

The verifiable storage connector type to use for decentralised state.

#### Default

```ts
verifiable-storage
```

***

### identityConnectorType?

> `optional` **identityConnectorType**: `string`

The identity connector.

#### Default

```ts
identity
```

***

### config

> **config**: [`ITrustedSynchronisedStorageServiceConfig`](ITrustedSynchronisedStorageServiceConfig.md)

The configuration for the connector.
