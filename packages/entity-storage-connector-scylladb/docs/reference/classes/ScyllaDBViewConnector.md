# Class: ScyllaDBViewConnector\<T, U\>

Manage entities using ScyllaDB Views.

## Extends

- `AbstractScyllaDBConnector`\<`U`\>

## Type parameters

• **T**

• **U**

## Implements

- `IEntityStorageConnector`\<`U`\>

## Constructors

### new ScyllaDBViewConnector()

> **new ScyllaDBViewConnector**\<`T`, `U`\>(`options`): [`ScyllaDBViewConnector`](ScyllaDBViewConnector.md)\<`T`, `U`\>

Create a new instance of ScyllaDBEntityStorage.

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

[`ScyllaDBViewConnector`](ScyllaDBViewConnector.md)\<`T`, `U`\>

#### Overrides

`AbstractScyllaDBConnector<U>.constructor`

## Properties

### \_viewSchema

> `private` `readonly` **\_viewSchema**: `IEntitySchema`\<`U`\>

The view descriptor.

## Methods

### get()

> **get**(`id`, `secondaryIndex`?, `requestContext`?): `Promise`\<`undefined` \| `U` & `object`\>

Get an entity.

#### Parameters

• **id**: `string`

The id of the entity to get.

• **secondaryIndex?**: keyof `U`

Get the item using a secondary index.

• **requestContext?**: `IServiceRequestContext`

The context for the request.

#### Returns

`Promise`\<`undefined` \| `U` & `object`\>

The object if it can be found or undefined.

#### Implementation of

`IEntityStorageConnector.get`

#### Inherited from

`AbstractScyllaDBConnector.get`

***

### query()

> **query**(`conditions`?, `sortProperties`?, `properties`?, `cursor`?, `pageSize`?, `requestContext`?): `Promise`\<`object`\>

Find all the entities which match the conditions.

#### Parameters

• **conditions?**: `EntityCondition`\<`U`\>

The conditions to match for the entities.

• **sortProperties?**: `object`[]

The optional sort order.

• **properties?**: keyof `U`[]

The optional properties to return, defaults to all.

• **cursor?**: `string`

The cursor to request the next page of entities.

• **pageSize?**: `number`

The maximum number of entities in a page.

• **requestContext?**: `IServiceRequestContext`

The context for the request.

#### Returns

`Promise`\<`object`\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

##### entities

> **entities**: `Partial`\<`U` & `object`\>[]

The entities, which can be partial if a limited keys list was provided.
If non partitioned request then partitionId is included in items.

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

> **bootstrap**(`systemPartitionId`): `Promise`\<`void`\>

Bootstrap the service by creating and initializing any resources it needs.

#### Parameters

• **systemPartitionId**: `string`

The system partition ID.

#### Returns

`Promise`\<`void`\>

The response of the bootstrapping as log entries.

#### Implementation of

`IEntityStorageConnector.bootstrap`

***

### set()

> **set**(`entity`, `requestContext`?): `Promise`\<`void`\>

Set an entity.

#### Parameters

• **entity**: `U`

The entity to set.

• **requestContext?**: `IServiceRequestContext`

The context for the request.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IEntityStorageConnector.set`

***

### remove()

> **remove**(`id`, `requestContext`?): `Promise`\<`void`\>

Delete the entity.

#### Parameters

• **id**: `string`

The id of the entity to remove.

• **requestContext?**: `IServiceRequestContext`

The context for the request.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IEntityStorageConnector.remove`
