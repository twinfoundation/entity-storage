# Interface: IDecentralisedEntityStorageConnectorConfig

Configuration for the Decentralised Entity Storage Connector.

## Properties

### verifiableStorageKey

> **verifiableStorageKey**: `string`

The key to use for the remote verifiable storage.

***

### decentralisedStorageMethodId?

> `optional` **decentralisedStorageMethodId**: `string`

The id of the identity method to use when signing/verifying changesets.

#### Default

```ts
decentralised-storage-assertion
```

***

### updateCheckIntervalMs?

> `optional` **updateCheckIntervalMs**: `number`

How often to check for updates in milliseconds.

#### Default

```ts
300000 (5 minutes)
```

***

### consolidationIntervalMs?

> `optional` **consolidationIntervalMs**: `number`

Interval to perform consolidation of changesets, only available if you have write access to the verifiable storage.

***

### remoteSyncEndpoint?

> `optional` **remoteSyncEndpoint**: `string`

When the node has no permissions to write to the verifiable storage, this is the endpoint to use for remote sync.
