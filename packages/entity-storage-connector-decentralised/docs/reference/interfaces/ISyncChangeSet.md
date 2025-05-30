# Interface: ISyncChangeSet\<T\>

The object definition for a sync change set.

## Type Parameters

### T

`T` = `unknown`

## Properties

### id

> **id**: `string`

The id of the snapshot.

***

### dateCreated

> **dateCreated**: `string`

The date the change set was created.

***

### dateModified?

> `optional` **dateModified**: `string`

The date the change set was last modified.

***

### changes

> **changes**: [`ISyncChange`](ISyncChange.md)\<`T`\>[]

The changes to perform.

***

### nodeIdentity

> **nodeIdentity**: `string`

The identity of the node that created the change set.

***

### proof?

> `optional` **proof**: `IProof`

The proof for the change set.
