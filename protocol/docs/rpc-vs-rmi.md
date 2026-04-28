# RPC vs RMI

Both let a client call code on a remote machine. The difference is
*what* gets called.

| | RPC | RMI |
|---|---|---|
| Programming style | Procedural | Object-oriented |
| Remote target | Function / procedure | Method on a specific object instance |
| State | Usually stateless | Often stateful per object |
| Client-side helper | Stub | Proxy |
| Server-side helper | Stub / handler | Skeleton |
| Example | `submitJob(req)` | `job.submit(req)` |
| Identity matters? | Rarely | Always — calls target one specific object |
| Migration concerns? | None | Object can move between peers |

## When to use each in Infernet

**RPC** for stateless or single-shot operations:
- `Handshake(req) → resp`
- `FindPeers(req) → peers[]`
- `FindValue(req) → value`
- `VerifyIntent(req) → state`

**RMI** for stateful object lifecycles:
- `ComputeJob.start() / .getStatus() / .cancel() / .streamLogs()`
- `PeerSession.open() / .send(msg) / .close()` (Petals chains)
- `TrainingCoordinator.acceptDelta() / .publishCheckpoint()` (Class C)

The decision tree: **does this call mutate state that subsequent
calls depend on?** If yes → RMI. If no → RPC.

## Why we have both

RPC is simpler and cheaper. RMI carries the cost of object identity,
lifecycle management, and migration semantics. We use the cheaper
one whenever it fits, reach for the heavier one only when state
demands it. Same principle as IPIP-0020's "don't reach for consensus
when CRDTs suffice" — match the primitive to the actual requirement.
