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

### context

> **context**: `string`

The context for the snapshot i.e. which entity is being synchronized.

***

### dateCreated

> **dateCreated**: `string`

The date the snapshot was created.

***

### dateModified?

> `optional` **dateModified**: `string`

The date the snapshot was last modified.

***

### isLocalSnapshot?

> `optional` **isLocalSnapshot**: `boolean`

The flag to determine if this is the current local snapshot containing changes for this node.

***

### changeSetStorageIds?

> `optional` **changeSetStorageIds**: `string`[]

The ids of the storage for the change sets in the snapshot, if this is not a local snapshot.

***

### localChanges?

> `optional` **localChanges**: [`ISyncChange`](../interfaces/ISyncChange.md)\<`T`\>[]

The changes that were made in this snapshot, if this is a local snapshot.
