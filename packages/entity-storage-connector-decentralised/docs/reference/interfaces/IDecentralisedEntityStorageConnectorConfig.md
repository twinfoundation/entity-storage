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

### entityUpdateIntervalMs?

> `optional` **entityUpdateIntervalMs**: `number`

How often to check for entity updates in milliseconds.

#### Default

```ts
300000 (5 minutes)
```

***

### isAuthoritativeNode?

> `optional` **isAuthoritativeNode**: `boolean`

Is this a node that has permission to write to the verifiable storage?

#### Default

```ts
false
```

***

### consolidationIntervalMs?

> `optional` **consolidationIntervalMs**: `number`

Interval to perform consolidation of changesets, only used if isAuthoritativeNode is set.

#### Default

```ts
300000 (5 minutes)
```

***

### remoteSyncEndpoint?

> `optional` **remoteSyncEndpoint**: `string`

This is the endpoint to use for remote sync when isAuthoritativeNode is not set.
