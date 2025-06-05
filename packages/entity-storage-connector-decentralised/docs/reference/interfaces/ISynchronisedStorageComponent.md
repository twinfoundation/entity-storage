# Interface: ISynchronisedStorageComponent\<T\>

Class for performing synchronised storage operations.

## Extends

- `IComponent`

## Type Parameters

### T

`T` *extends* [`ISynchronisedEntity`](ISynchronisedEntity.md) = [`ISynchronisedEntity`](ISynchronisedEntity.md)

## Methods

### prepareEntityForSync()

> **prepareEntityForSync**(`entity`): `Promise`\<`void`\>

Prepares an entry for synchronisation.

#### Parameters

##### entity

`T`

The entity to prepare for synchronisation.

#### Returns

`Promise`\<`void`\>

Nothing.

***

### syncEntitySet()

> **syncEntitySet**(`entity`): `Promise`\<`void`\>

Synchronise an entity storage operation.

#### Parameters

##### entity

`T`

The entity to synchronise.

#### Returns

`Promise`\<`void`\>

Nothing.

***

### syncEntityRemove()

> **syncEntityRemove**(`id`): `Promise`\<`void`\>

Synchronise an entity removal operation.

#### Parameters

##### id

`string`

The id of the entity to synchronise.

#### Returns

`Promise`\<`void`\>

Nothing.
