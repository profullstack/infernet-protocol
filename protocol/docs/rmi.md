# `infernet.rmi.v1`

Remote Method Invocation — the object-oriented sibling of plain RPC.
Where RPC calls a free-standing function, RMI calls a method on a
specific object instance identified by an `ObjectRef`. The object
lives on a particular peer and carries state across calls.

IDL: [`protocol/proto/rmi/v1/rmi.proto`](../proto/rmi/v1/rmi.proto) ·
Related: [rpc-vs-rmi.md](rpc-vs-rmi.md) · [remote-object-lifecycle.md](remote-object-lifecycle.md) · [object-registry.md](object-registry.md).

## Architecture

```mermaid
flowchart LR
    ClientApp[Client Application]
    Proxy[Client Proxy]
    Network[libp2p stream]
    Skeleton[Server Skeleton]
    Registry[Object Registry<br/>DHT-backed]
    Object[Remote Object Instance]

    ClientApp -->|method call| Proxy
    Proxy -->|RmiRequest| Network
    Network -->|deliver| Skeleton
    Skeleton -->|lookup object_id| Registry
    Registry --> Object
    Skeleton -->|invoke method| Object
    Object -->|result/error| Skeleton
    Skeleton -->|RmiResponse| Network
    Network --> Proxy
    Proxy -->|return| ClientApp
```

## Basic invocation

```mermaid
sequenceDiagram
    participant Client
    participant Proxy
    participant Skeleton
    participant Object as Remote Object
    Client->>Proxy: object.method(args)
    Proxy->>Skeleton: RmiRequest(object_ref, method_name, args)
    Skeleton->>Object: invoke method(args)
    Object-->>Skeleton: result
    Skeleton-->>Proxy: RmiResponse(ok=true, return_value)
    Proxy-->>Client: result
```

## Object migration

Ownership can move between peers (rebalancing, peer churn). Old
owner returns `OBJECT_MIGRATED` with the new owner's `ObjectRef`;
the client retries against the new owner.

```mermaid
sequenceDiagram
    participant Client
    participant Registry as DHT Registry
    participant OldOwner
    participant NewOwner
    Client->>Registry: lookup object_id
    Registry-->>Client: ObjectRef(owner=OldOwner)
    Client->>OldOwner: Invoke method()
    OldOwner-->>Client: OBJECT_MIGRATED, migrated_to=NewOwner
    Client->>NewOwner: Invoke method()
    NewOwner-->>Client: result
    NewOwner->>Registry: update owner=NewOwner
```

## Error codes

| Code | Meaning |
|---|---|
| `OBJECT_NOT_FOUND` | object_id doesn't exist or expired |
| `METHOD_NOT_FOUND` | object doesn't expose that method |
| `BAD_ARGUMENTS` | argument validation failed |
| `UNAUTHORIZED` | caller lacks permission |
| `STATE_CONFLICT` | method invalid for object's current state |
| `TIMEOUT` | invocation exceeded deadline |
| `OBJECT_MIGRATED` | object moved; see migrated_to |
| `INTERNAL_ERROR` | unhandled server-side error |

## Security

```mermaid
flowchart TD
    A[RmiRequest] --> B[Verify caller_signature]
    B --> C[Check timestamp / nonce]
    C --> D[Lookup object in registry]
    D --> E[Authorize caller for object]
    E --> F[Allowlist check on method_name]
    F --> G[Validate args + content_type]
    G --> H[Invoke]
```

- Every request is Nostr-signed; receivers verify before decode
- `request_id` is the idempotency key (per IPIP-0014 §1) — same id
  + same body → cached response, never re-execute
- Method names use an allowlist per object type — no reflection on
  arbitrary attributes
- Per-peer + per-object + per-method rate limits

## Compatibility

Object types are versioned in their `type_name`, e.g.
`infernet.compute.ComputeJob.v1`. Bumping the type version is a
breaking change exactly like bumping a protobuf package. Clients
choose the type version they speak via the existing handshake-
negotiated protocol set.
