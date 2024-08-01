[**@gtsc/entity-storage-connector-scylladb**](../overview.md) • **Docs**

***

# Class: ScyllaDBTableConnector\<T\>

Store entities using ScyllaDB.

## Extends

- `AbstractScyllaDBConnector`\<`T`\>

## Type parameters

• **T** = `unknown`

## Implements

- `IEntityStorageConnector`\<`T`\>

## Constructors

### new ScyllaDBTableConnector()

> **new ScyllaDBTableConnector**\<`T`\>(`options`): [`ScyllaDBTableConnector`](ScyllaDBTableConnector.md)\<`T`\>

Create a new instance of FileEntityStorageConnector.

#### Parameters

• **options**

The options for the connector.

• **options.loggingConnectorType?**: `string`

The type of logging connector to use, defaults to "logging".

• **options.entitySchema**: `string`

The name of the entity schema.

• **options.config**: [`IScyllaDBTableConfig`](../interfaces/IScyllaDBTableConfig.md)

The configuration for the connector.

#### Returns

[`ScyllaDBTableConnector`](ScyllaDBTableConnector.md)\<`T`\>

#### Inherited from

`AbstractScyllaDBConnector<T>.constructor`

## Methods

### get()

> **get**(`id`, `secondaryIndex`?, `requestContext`?): `Promise`\<`undefined` \| `T` & `object`\>

Get an entity.

#### Parameters

• **id**: `string`

The id of the entity to get.

• **secondaryIndex?**: keyof `T`

Get the item using a secondary index.

• **requestContext?**: `IServiceRequestContext`

The context for the request.

#### Returns

`Promise`\<`undefined` \| `T` & `object`\>

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

• **requestContext?**: `IServiceRequestContext`

The context for the request.

#### Returns

`Promise`\<`object`\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

##### entities

> **entities**: `Partial`\<`T` & `object`\>[]

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

The System Partition ID.

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

• **entity**: `T`

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

***

### pageSize()

> **pageSize**(): `number`

Get the default page size of the entity storage.

#### Returns

`number`

The entitty storage page size.

***

### dropTable()

> **dropTable**(`requestContext`): `Promise`\<`void`\>

Drops table.

#### Parameters

• **requestContext**: `IServiceRequestContext`

Context Request.

#### Returns

`Promise`\<`void`\>

***

### truncateTable()

> **truncateTable**(`requestContext`): `Promise`\<`void`\>

Truncates (clear) table.

#### Parameters

• **requestContext**: `IServiceRequestContext`

Context Request.

#### Returns

`Promise`\<`void`\>

***

### toDbField()

> `private` **toDbField**(`logicalField`): `string`

Transform a logically descripted field into a DB field.

#### Parameters

• **logicalField**: `IEntitySchemaProperty`\<`T`\>

The logical field description.

#### Returns

`string`

The DB type.

#### Throws

GeneralException if no mapping found.
