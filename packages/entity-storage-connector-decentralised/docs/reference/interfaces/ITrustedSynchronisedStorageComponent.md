# Interface: ITrustedSynchronisedStorageComponent

Class for performing synchronised storage operations.

## Extends

- `IComponent`

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
