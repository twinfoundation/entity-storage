# Interface: ISynchronisedStorageComponent\<T\>

Class for performing synchronised storage operations.

## Extends

- `IComponent`

## Type Parameters

### T

`T` *extends* [`ISynchronisedEntity`](ISynchronisedEntity.md) = [`ISynchronisedEntity`](ISynchronisedEntity.md)

## Methods

### prepare()

> **prepare**(`entity`): `Promise`\<`void`\>

Prepares an entry for synchronisation.

#### Parameters

##### entity

`T`

The entity to prepare for synchronisation.

#### Returns

`Promise`\<`void`\>

Nothing.

***

### set()

> **set**(`entity`): `Promise`\<`void`\>

Synchronise an entity storage operation.

#### Parameters

##### entity

`T`

The entity to synchronise.

#### Returns

`Promise`\<`void`\>

Nothing.

***

### remove()

> **remove**(`id`): `Promise`\<`void`\>

Synchronise an entity removal operation.

#### Parameters

##### id

`string`

The id of the entity to synchronise.

#### Returns

`Promise`\<`void`\>

Nothing.
