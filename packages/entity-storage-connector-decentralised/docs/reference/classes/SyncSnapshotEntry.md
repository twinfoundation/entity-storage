# Class: SyncSnapshotEntry\<T\>

Class representing an entry for the sync snapshot.

## Type Parameters

### T

`T` = `unknown`

## Constructors

### Constructor

> **new SyncSnapshotEntry**\<`T`\>(): `SyncSnapshotEntry`\<`T`\>

#### Returns

`SyncSnapshotEntry`\<`T`\>

## Properties

### id

> **id**: `string`

The id for the snapshot.

***

### dateCreated

> **dateCreated**: `string`

The date the snapshot was created.

***

### dateModified?

> `optional` **dateModified**: `string`

The date the snapshot was last modified.

***

### changeSetStorageIds

> **changeSetStorageIds**: `string`[]

The ids of the storage for the change sets in the snapshot.

***

### isLocalSnapshot?

> `optional` **isLocalSnapshot**: `boolean`

The flag to determine this is the current local snapshot.

***

### changes?

> `optional` **changes**: [`ISyncChange`](../interfaces/ISyncChange.md)\<`T`\>[]

The changes that were made in this snapshot.
