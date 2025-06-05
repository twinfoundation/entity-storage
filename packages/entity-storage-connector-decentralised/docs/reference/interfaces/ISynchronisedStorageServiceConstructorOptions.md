# Interface: ISynchronisedStorageServiceConstructorOptions

Options for the Synchronised Storage Service constructor.

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

### blobStorageConnectorType?

> `optional` **blobStorageConnectorType**: `string`

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

### trustedSynchronisedStorageConnectorType?

> `optional` **trustedSynchronisedStorageConnectorType**: `string`

The synchronised entity storage connector type to use if this node is not trusted.

***

### config

> **config**: [`ISynchronisedStorageServiceConfig`](ISynchronisedStorageServiceConfig.md)

The configuration for the connector.
