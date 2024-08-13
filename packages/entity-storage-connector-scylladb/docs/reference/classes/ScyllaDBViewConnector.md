# Class: ScyllaDBViewConnector\<T\>

Manage entities using ScyllaDB Views.

## Extends

- `AbstractScyllaDBConnector`\<`T`\>

## Type parameters

• **T**

## Implements

- `IEntityStorageConnector`\<`T`\>

## Constructors

### new ScyllaDBViewConnector()

> **new ScyllaDBViewConnector**\<`T`\>(`options`): [`ScyllaDBViewConnector`](ScyllaDBViewConnector.md)\<`T`\>

Create a new instance of ScyllaDBViewConnector.

#### Parameters

• **options**

The options for the connector.

• **options.loggingConnectorType?**: `string`

The type of logging connector to use, defaults to "logging".

• **options.entitySchema**: `string`

The name of the entity schema.

• **options.viewSchema**: `string`

The name of the view schema.

• **options.config**: [`IScyllaDBViewConfig`](../interfaces/IScyllaDBViewConfig.md)

The configuration for the connector.

#### Returns

[`ScyllaDBViewConnector`](ScyllaDBViewConnector.md)\<`T`\>

#### Overrides

`AbstractScyllaDBConnector<T>.constructor`

## Properties

### CLASS\_NAME

> `readonly` **CLASS\_NAME**: `string`

Runtime name for the class.

#### Implementation of

`IEntityStorageConnector.CLASS_NAME`

#### Overrides

`AbstractScyllaDBConnector.CLASS_NAME`

***

### \_viewSchema

> `private` `readonly` **\_viewSchema**: `IEntitySchema`\<`T`\>

The view descriptor.

## Methods

### get()

> **get**(`id`, `secondaryIndex`?): `Promise`\<`undefined` \| `T`\>

Get an entity.

#### Parameters

• **id**: `string`

The id of the entity to get.

• **secondaryIndex?**: keyof `T`

Get the item using a secondary index.

#### Returns

`Promise`\<`undefined` \| `T`\>

The object if it can be found or undefined.

#### Implementation of

`IEntityStorageConnector.get`

#### Inherited from

`AbstractScyllaDBConnector.get`

***

### query()

> **query**(`conditions`?, `sortProperties`?, `properties`?, `cursor`?, `pageSize`?): `Promise`\<`object`\>

Find all the entities which match the conditions.

#### Parameters

• **conditions?**: `EntityCondition`\<`T`\>

The conditions to match for the entities.

• **sortProperties?**: `object`[]

The optional sort order.

• **properties?**: keyof `T`[]

The optional properties to return, defaults to all.

• **cursor?**: `string`

The cursor to request the next page of entities.

• **pageSize?**: `number`

The maximum number of entities in a page.

#### Returns

`Promise`\<`object`\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

##### entities

> **entities**: `Partial`\<`T`\>[]

The entities, which can be partial if a limited keys list was provided.

##### cursor?

> `optional` **cursor**: `string`

An optional cursor, when defined can be used to call find to get more entities.

##### pageSize?

> `optional` **pageSize**: `number`

Number of entities to return.

##### totalEntities

> **totalEntities**: `number`

Total entities length.

#### Implementation of

`IEntityStorageConnector.query`

#### Inherited from

`AbstractScyllaDBConnector.query`

***

### bootstrap()

> **bootstrap**(`nodeLoggingConnectorType`?): `Promise`\<`boolean`\>

Bootstrap the connector by creating and initializing any resources it needs.

#### Parameters

• **nodeLoggingConnectorType?**: `string`

The node logging connector type, defaults to "node-logging".

#### Returns

`Promise`\<`boolean`\>

True if the bootstrapping process was successful.

#### Implementation of

`IEntityStorageConnector.bootstrap`

***

### set()

> **set**(`entity`): `Promise`\<`void`\>

Set an entity.

#### Parameters

• **entity**: `T`

The entity to set.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IEntityStorageConnector.set`

***

### remove()

> **remove**(`id`): `Promise`\<`void`\>

Delete the entity.

#### Parameters

• **id**: `string`

The id of the entity to remove.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IEntityStorageConnector.remove`
