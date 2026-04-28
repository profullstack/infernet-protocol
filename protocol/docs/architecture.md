# Protocol architecture

The Infernet peer-to-peer protocol is defined as a set of versioned
Protocol Buffers packages under `protocol/proto/`. This document is
the entry point — read it first, then dive into the per-protocol
markdown for the wire details.

Spec: [IPIP-0021](../../ipips/ipip-0021.md).

## Packages at a glance

| Package | Purpose | Doc |
|---|---|---|
| `infernet.handshake.v1` | First contact: peer ID + version negotiation | [handshake.md](handshake.md) |
| `infernet.peer.v1`      | Find peers by namespace + protocol filter | [discovery.md](discovery.md) |
| `infernet.dht.v1`       | Kademlia key-value lookup | [dht.md](dht.md) |
| `infernet.pubsub.v1`    | Topic gossip with TTL + dedup | [pubsub.md](pubsub.md) |
| `infernet.compute.v1`   | Job submission + status streaming | [compute.md](compute.md) |
| `infernet.payment.v1`   | Payment-intent verification (verify-only) | [payment.md](payment.md) |
| `infernet.rmi.v1`       | Remote method invocation on stateful objects | [rmi.md](rmi.md) |

## End-to-end flow

```mermaid
flowchart LR
    A[IDL Source<br/>protocol/proto/**/*.proto]
    B[Schema Validation<br/>protoc + buf lint]
    C[Code Generation]
    D1[JavaScript SDK]
    D2[Rust SDK]
    D3[Go SDK]
    D4[Python SDK]
    E[Wire Fixtures<br/>protocol/tests/fixtures/]
    F[Cross-SDK Compatibility Tests]
    G[Published @infernetprotocol/protocol]

    A --> B
    B --> C
    C --> D1
    C --> D2
    C --> D3
    C --> D4
    C --> E
    E --> F
    F --> G
```

## Connection lifecycle

```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> Handshaking: HandshakeRequest
    Handshaking --> Connected: HandshakeResponse.accepted=true
    Handshaking --> Rejected: HandshakeResponse.accepted=false
    Connected --> DiscoveringPeers: FindPeersRequest
    DiscoveringPeers --> Connected
    Connected --> RunningJob: SubmitJob
    RunningJob --> StreamingLogs: StreamJobLogs
    StreamingLogs --> JobComplete
    RunningJob --> JobFailed
    JobComplete --> Connected
    JobFailed --> Connected
    Rejected --> [*]
```

## Layering against existing IPIPs

The proto packages sit on top of the distributed-systems primitives
already specified:

```mermaid
flowchart TD
    subgraph Wire[Wire layer — IPIP-0021]
        H[handshake.v1]
        P[peer.v1]
        D[dht.v1]
        PS[pubsub.v1]
        C[compute.v1]
        PAY[payment.v1]
        R[rmi.v1]
    end

    subgraph Primitives[Primitives — IPIP-0014/0015/0017/0018]
        IDM[idempotency keys]
        FP[model fingerprints]
        LMP[Lamport seq + IR2]
        CDP[causal dependency stamps]
        CRDT[CRDT merge]
        CB[causal broadcast]
    end

    subgraph Transport[Transport]
        LP[libp2p streams<br/>Nostr-signed envelopes]
    end

    H --> LP
    P --> LP
    D --> LP
    PS --> LP
    C --> LP
    PAY --> LP
    R --> LP

    H -.uses.-> IDM
    C -.uses.-> IDM
    R -.uses.-> IDM
    D -.uses.-> FP
    C -.uses.-> FP
    PS -.uses.-> CB
    PS -.uses.-> CDP
    R -.uses.-> CDP
    D -.uses.-> CRDT
```

Every wire message is carried inside a Nostr-signed envelope
(IPIP-0003). Receivers verify the signature **before** decoding
the protobuf payload — a malformed payload should never reach
decode logic on the strength of an unverified envelope alone.

## Versioning

Protocol packages are versioned in their package name
(`infernet.<name>.v<n>`). Bumping the version is a breaking
change. Backwards-compatible additions go in the existing version
as new optional fields with new field numbers — old clients ignore
them, new clients see defaults when reading old messages.

```mermaid
flowchart LR
    subgraph V1[Protocol v1]
        H1[handshake.v1]
        C1[compute.v1]
    end
    subgraph V2[Protocol v2]
        H2[handshake.v2]
        C2[compute.v2]
    end

    NA[Node A: v1 + v2]
    NB[Node B: v1 only]
    NC[Node C: v2 only]

    NA --> V1
    NA --> V2
    NB --> V1
    NC --> V2

    NA <-->|handshake.v1| NB
    NA <-->|handshake.v2| NC
```

The handshake step (per peer) negotiates the highest common
protocol version each side supports. No protocol stream opens
before this is done.

## Where to go next

- [handshake.md](handshake.md) — what happens on first connect
- [compatibility.md](compatibility.md) — version-bump rules
- [security.md](security.md) — envelope, replay, rate limits
- [rmi.md](rmi.md) — object-oriented invocation on top of the wire layer
