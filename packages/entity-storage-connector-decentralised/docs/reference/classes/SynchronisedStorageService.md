# Class: SynchronisedStorageService\<T\>

Class for performing synchronised storage operations.

## Type Parameters

### T

`T` *extends* [`ISynchronisedEntity`](../interfaces/ISynchronisedEntity.md) = [`ISynchronisedEntity`](../interfaces/ISynchronisedEntity.md)

## Implements

- [`ISynchronisedStorageService`](../interfaces/ISynchronisedStorageService.md)\<`T`\>

## Constructors

### Constructor

> **new SynchronisedStorageService**\<`T`\>(`options`): `SynchronisedStorageService`\<`T`\>

Create a new instance of SynchronisedStorageService.

#### Parameters

##### options

[`ISynchronisedStorageServiceConstructorOptions`](../interfaces/ISynchronisedStorageServiceConstructorOptions.md)

The options for the service.

#### Returns

`SynchronisedStorageService`\<`T`\>

## Properties

### CLASS\_NAME

> `readonly` **CLASS\_NAME**: `string`

Runtime name for the class.

#### Implementation of

`ISynchronisedStorageService.CLASS_NAME`

## Methods

### start()

> **start**(`nodeIdentity`, `nodeLoggingConnectorType`, `componentState?`): `Promise`\<`void`\>

The component needs to be started when the node is initialized.

#### Parameters

##### nodeIdentity

`string`

The identity of the node starting the component.

##### nodeLoggingConnectorType

The node logging connector type, defaults to "node-logging".

`undefined` | `string`

##### componentState?

A persistent state which can be modified by the method.

#### Returns

`Promise`\<`void`\>

Nothing.

#### Implementation of

`ISynchronisedStorageService.start`

***

### stop()

> **stop**(`nodeIdentity`, `nodeLoggingConnectorType`, `componentState?`): `Promise`\<`void`\>

The component needs to be stopped when the node is closed.

#### Parameters

##### nodeIdentity

`string`

The identity of the node stopping the component.

##### nodeLoggingConnectorType

The node logging connector type, defaults to "node-logging".

`undefined` | `string`

##### componentState?

A persistent state which can be modified by the method.

#### Returns

`Promise`\<`void`\>

Nothing.

#### Implementation of

`ISynchronisedStorageService.stop`

***

### prepareEntityForSync()

> **prepareEntityForSync**(`entity`): `Promise`\<`void`\>

Prepares an entry for synchronisation.

#### Parameters

##### entity

`T`

The entity to prepare for synchronisation.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`ISynchronisedStorageService`](../interfaces/ISynchronisedStorageService.md).[`prepareEntityForSync`](../interfaces/ISynchronisedStorageService.md#prepareentityforsync)

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

#### Implementation of

[`ISynchronisedStorageService`](../interfaces/ISynchronisedStorageService.md).[`syncEntitySet`](../interfaces/ISynchronisedStorageService.md#syncentityset)

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

#### Implementation of

[`ISynchronisedStorageService`](../interfaces/ISynchronisedStorageService.md).[`syncEntityRemove`](../interfaces/ISynchronisedStorageService.md#syncentityremove)

***

### syncChangeSet()

> **syncChangeSet**(`changeSetStorageId`): `Promise`\<`void`\>

Synchronise a complete set of changes, assumes this is a trusted node.

#### Parameters

##### changeSetStorageId

`string`

The id of the change set to synchronise in blob storage.

#### Returns

`Promise`\<`void`\>

Nothing.

#### Implementation of

[`ISynchronisedStorageService`](../interfaces/ISynchronisedStorageService.md).[`syncChangeSet`](../interfaces/ISynchronisedStorageService.md#syncchangeset)
