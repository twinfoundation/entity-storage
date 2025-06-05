# Interface: ISynchronisedStorageServiceConstructorOptions

Options for the Synchronised Storage Service constructor.

## Extends

- [`ITrustedSynchronisedStorageServiceConstructorOptions`](ITrustedSynchronisedStorageServiceConstructorOptions.md)

## Properties

### trustedSynchronisedStorageComponentType?

> `optional` **trustedSynchronisedStorageComponentType**: `string`

The synchronised entity storage component type to use if this node is not trusted.

***

### config

> **config**: [`ISynchronisedStorageServiceConfig`](ISynchronisedStorageServiceConfig.md)

The configuration for the connector.

#### Overrides

[`ITrustedSynchronisedStorageServiceConstructorOptions`](ITrustedSynchronisedStorageServiceConstructorOptions.md).[`config`](ITrustedSynchronisedStorageServiceConstructorOptions.md#config)

***

### entitySchema

> **entitySchema**: `string`

The name of the entity schema.

#### Inherited from

[`ITrustedSynchronisedStorageServiceConstructorOptions`](ITrustedSynchronisedStorageServiceConstructorOptions.md).[`entitySchema`](ITrustedSynchronisedStorageServiceConstructorOptions.md#entityschema)

***

### entityStorageConnectorType

> **entityStorageConnectorType**: `string`

The entity storage connector type to use for actual data.

#### Inherited from

[`ITrustedSynchronisedStorageServiceConstructorOptions`](ITrustedSynchronisedStorageServiceConstructorOptions.md).[`entityStorageConnectorType`](ITrustedSynchronisedStorageServiceConstructorOptions.md#entitystorageconnectortype)

***

### syncSnapshotStorageConnectorType?

> `optional` **syncSnapshotStorageConnectorType**: `string`

The entity storage connector type to use for sync snapshots.

#### Default

```ts
sync-snapshot-entry
```

#### Inherited from

[`ITrustedSynchronisedStorageServiceConstructorOptions`](ITrustedSynchronisedStorageServiceConstructorOptions.md).[`syncSnapshotStorageConnectorType`](ITrustedSynchronisedStorageServiceConstructorOptions.md#syncsnapshotstorageconnectortype)

***

### blobStorageConnectorType?

> `optional` **blobStorageConnectorType**: `string`

The blob storage component used for remote sync state.

#### Default

```ts
blob-storage
```

#### Inherited from

[`ITrustedSynchronisedStorageServiceConstructorOptions`](ITrustedSynchronisedStorageServiceConstructorOptions.md).[`blobStorageConnectorType`](ITrustedSynchronisedStorageServiceConstructorOptions.md#blobstorageconnectortype)

***

### verifiableStorageConnectorType?

> `optional` **verifiableStorageConnectorType**: `string`

The verifiable storage connector type to use for decentralised state.

#### Default

```ts
verifiable-storage
```

#### Inherited from

[`ITrustedSynchronisedStorageServiceConstructorOptions`](ITrustedSynchronisedStorageServiceConstructorOptions.md).[`verifiableStorageConnectorType`](ITrustedSynchronisedStorageServiceConstructorOptions.md#verifiablestorageconnectortype)

***

### identityConnectorType?

> `optional` **identityConnectorType**: `string`

The identity connector.

#### Default

```ts
identity
```

#### Inherited from

[`ITrustedSynchronisedStorageServiceConstructorOptions`](ITrustedSynchronisedStorageServiceConstructorOptions.md).[`identityConnectorType`](ITrustedSynchronisedStorageServiceConstructorOptions.md#identityconnectortype)
