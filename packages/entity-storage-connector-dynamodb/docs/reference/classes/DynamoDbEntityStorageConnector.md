# Class: DynamoDbEntityStorageConnector\<T\>

Class for performing entity storage operations using Dynamo DB.

## Type Parameters

### T

`T` = `unknown`

## Implements

- `IEntityStorageConnector`\<`T`\>

## Constructors

### Constructor

> **new DynamoDbEntityStorageConnector**\<`T`\>(`options`): `DynamoDbEntityStorageConnector`\<`T`\>

Create a new instance of DynamoDbEntityStorageConnector.

#### Parameters

##### options

[`IDynamoDbEntityStorageConnectorConstructorOptions`](../interfaces/IDynamoDbEntityStorageConnectorConstructorOptions.md)

The options for the connector.

#### Returns

`DynamoDbEntityStorageConnector`\<`T`\>

## Properties

### CLASS\_NAME

> `readonly` **CLASS\_NAME**: `string`

Runtime name for the class.

#### Implementation of

`IEntityStorageConnector.CLASS_NAME`

## Methods

### bootstrap()

> **bootstrap**(`nodeLoggingConnectorType?`): `Promise`\<`boolean`\>

Bootstrap the component by creating and initializing any resources it needs.

#### Parameters

##### nodeLoggingConnectorType?

`string`

The node logging connector type, defaults to "node-logging".

#### Returns

`Promise`\<`boolean`\>

True if the bootstrapping process was successful.

#### Implementation of

`IEntityStorageConnector.bootstrap`

***

### getSchema()

> **getSchema**(): `IEntitySchema`

Get the schema for the entities.

#### Returns

`IEntitySchema`

The schema for the entities.

#### Implementation of

`IEntityStorageConnector.getSchema`

***

### get()

> **get**(`id`, `secondaryIndex?`, `conditions?`): `Promise`\<`undefined` \| `T`\>

Get an entity.

#### Parameters

##### id

`string`

The id of the entity to get, or the index value if secondaryIndex is set.

##### secondaryIndex?

keyof `T`

Get the item using a secondary index.

##### conditions?

`object`[]

The optional conditions to match for the entities.

#### Returns

`Promise`\<`undefined` \| `T`\>

The object if it can be found or undefined.

#### Implementation of

`IEntityStorageConnector.get`

***

### set()

> **set**(`entity`, `conditions?`): `Promise`\<`void`\>

Set an entity.

#### Parameters

##### entity

`T`

The entity to set.

##### conditions?

`object`[]

The optional conditions to match for the entities.

#### Returns

`Promise`\<`void`\>

The id of the entity.

#### Implementation of

`IEntityStorageConnector.set`

***

### remove()

> **remove**(`id`, `conditions?`): `Promise`\<`void`\>

Remove the entity.

#### Parameters

##### id

`string`

The id of the entity to remove.

##### conditions?

`object`[]

The optional conditions to match for the entities.

#### Returns

`Promise`\<`void`\>

Nothing.

#### Implementation of

`IEntityStorageConnector.remove`

***

### query()

> **query**(`conditions?`, `sortProperties?`, `properties?`, `cursor?`, `pageSize?`): `Promise`\<\{ `entities`: `Partial`\<`T`\>[]; `cursor?`: `string`; \}\>

Find all the entities which match the conditions.

#### Parameters

##### conditions?

`EntityCondition`\<`T`\>

The conditions to match for the entities.

##### sortProperties?

`object`[]

The optional sort order.

##### properties?

keyof `T`[]

The optional properties to return, defaults to all.

##### cursor?

`string`

The cursor to request the next page of entities.

##### pageSize?

`number`

The suggested number of entities to return in each chunk, in some scenarios can return a different amount.

#### Returns

`Promise`\<\{ `entities`: `Partial`\<`T`\>[]; `cursor?`: `string`; \}\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

#### Implementation of

`IEntityStorageConnector.query`

***

### tableDelete()

> **tableDelete**(): `Promise`\<`void`\>

Delete the table.

#### Returns

`Promise`\<`void`\>

Nothing.
