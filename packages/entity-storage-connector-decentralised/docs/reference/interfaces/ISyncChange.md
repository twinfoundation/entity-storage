# Interface: ISyncChange\<T\>

The object definition for a sync change.

## Type Parameters

### T

`T`

## Properties

### operation

> **operation**: `"set"` \| `"delete"`

Operation.

***

### id?

> `optional` **id**: `string`

The item id of the operation if it is a delete.

***

### entity?

> `optional` **entity**: `T`

The entity to set.
