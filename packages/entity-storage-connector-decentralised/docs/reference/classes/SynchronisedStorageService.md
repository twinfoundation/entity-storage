# Class: SynchronisedStorageService\<T\>

Class for performing synchronised storage operations.

## Type Parameters

### T

`T` *extends* [`ISynchronisedEntity`](../interfaces/ISynchronisedEntity.md) = [`ISynchronisedEntity`](../interfaces/ISynchronisedEntity.md)

## Implements

- [`ISynchronisedStorageComponent`](../interfaces/ISynchronisedStorageComponent.md)\<`T`\>

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

`ISynchronisedStorageComponent.CLASS_NAME`

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

`ISynchronisedStorageComponent.start`

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

`ISynchronisedStorageComponent.stop`

***

### prepare()

> **prepare**(`entity`): `Promise`\<`void`\>

Prepares an entry for synchronisation.

#### Parameters

##### entity

`T`

The entity to prepare for synchronisation.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`ISynchronisedStorageComponent`](../interfaces/ISynchronisedStorageComponent.md).[`prepare`](../interfaces/ISynchronisedStorageComponent.md#prepare)

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

#### Implementation of

[`ISynchronisedStorageComponent`](../interfaces/ISynchronisedStorageComponent.md).[`set`](../interfaces/ISynchronisedStorageComponent.md#set)

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

#### Implementation of

[`ISynchronisedStorageComponent`](../interfaces/ISynchronisedStorageComponent.md).[`remove`](../interfaces/ISynchronisedStorageComponent.md#remove)
