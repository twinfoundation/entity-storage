# Class: TrustedSynchronisedStorageService

Class for performing synchronised storage operations.

## Implements

- [`ITrustedSynchronisedStorageComponent`](../interfaces/ITrustedSynchronisedStorageComponent.md)

## Constructors

### Constructor

> **new TrustedSynchronisedStorageService**(`options`): `TrustedSynchronisedStorageService`

Create a new instance of SynchronisedTrustedStorageService.

#### Parameters

##### options

[`ITrustedSynchronisedStorageServiceConstructorOptions`](../interfaces/ITrustedSynchronisedStorageServiceConstructorOptions.md)

The options for the service.

#### Returns

`TrustedSynchronisedStorageService`

## Properties

### CLASS\_NAME

> `readonly` **CLASS\_NAME**: `string`

Runtime name for the class.

#### Implementation of

`ITrustedSynchronisedStorageComponent.CLASS_NAME`

## Methods

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

[`ITrustedSynchronisedStorageComponent`](../interfaces/ITrustedSynchronisedStorageComponent.md).[`syncChangeSet`](../interfaces/ITrustedSynchronisedStorageComponent.md#syncchangeset)
