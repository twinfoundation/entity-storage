# Interface: IFirestoreEntityStorageConnectorConfig

Configuration for the Firestore Entity Storage Connector.

## Properties

### projectId

> **projectId**: `string`

The GCP project ID.

***

### collectionName

> **collectionName**: `string`

The name of the collection for the storage.

***

### keyFilename?

> `optional` **keyFilename**: `string`

The path to the service account key file (optional for production when using default credentials).

***

### emulatorHost?

> `optional` **emulatorHost**: `string`

The emulator host for local testing (e.g., "localhost:8080").

***

### settings?

> `optional` **settings**: `object`

Optional settings for Firestore client initialization.

#### maxIdleChannels?

> `optional` **maxIdleChannels**: `number`

The maximum number of idle channels to keep open.

#### timeout?

> `optional` **timeout**: `number`

The custom timeout for requests (in milliseconds).

***

### credentials?

> `optional` **credentials**: `object`

The GCP credentials (optional for local development or when using default credentials).

#### client\_email

> **client\_email**: `string`

#### private\_key

> **private\_key**: `string`

***

### undefinedValueHandling?

> `optional` **undefinedValueHandling**: `"remove"` \| `"convert-to-null"` \| `"throw-error"`

Specifies how to handle undefined values when storing data in Firestore.
- 'remove': Remove properties with undefined values (default)
- 'convert-to-null': Convert undefined values to null
- 'throw-error': Throw an error if undefined values are encountered
