# FLOAT STUDIO — DATA AND TASK STATE MACHINES

**Specification Version:** v1.2.2  
**Scope:** Durable Project Persistence, Cloud Agent Lifecycle, and Tool Execution Gates  

---

## 1. Cloud Agent Task State Machine

The Cloud Agent background execution subsystem tracks autonomous multi-subtask runs across isolated worktrees.

```
       +--------------+
       |    QUEUED    | <----+ (Created by client)
       +-------+------+      |
               | claimRun()  |
               v             |
       +--------------+      | Lease expired / abandoned
       |   CLAIMED    | -----+
       +-------+------+
               | Worker begins execution
               v
       +--------------+  checkpoint()
       |   RUNNING    | <-----------> CHECKPOINTED
       +-------+------+
               |
               +---------------------> WAITING_FOR_APPROVAL
               |                       (Requires human review)
               |
      +--------+--------+-------------+
      |                 |             |
      v                 v             v
+-----------+     +-----------+ +-----------+
| COMPLETED |     |  FAILED   | | CANCELED  |
+-----------+     +-----------+ +-----------+
```

### State Definitions
- `QUEUED`: Task submitted by user and awaiting available background worker.
- `CLAIMED`: Leased to a worker instance with an active `leaseExpiresAt` fencing lease.
- `RUNNING`: Worker actively executing subtasks and streaming events.
- `CHECKPOINTED`: Workspace snapshot captured to allow deterministic rollback.
- `WAITING_FOR_APPROVAL`: Model generated proposals or commands requiring explicit human authorization.
- `COMPLETED`: All subtasks concluded successfully; proposals synthesized and validated.
- `FAILED`: Execution terminated with fatal unrecoverable errors.
- `TIMED_OUT`: Worker failed to renew lease heartbeat before `leaseExpiresAt`.
- `CANCELED`: Task explicitly aborted by user or administrator.

### Worker Fencing & Reconnectable SSE Streams
- **Leasing:** Workers acquire tasks via `claimRun(runId, workerId, leaseMs)`. Heartbeats (`heartbeatRun`) extend the lease.
- **Event Streaming:** Each progress event advances the sequence `cursor`. Disconnected clients re-attach using `Last-Event-ID` / cursor parameters via `getEventsSince(runId, lastCursor)` without interrupting task execution.

---

## 2. Project Persistence & Byte-Bounded Chunking (Storage Version 2)

### The 10 MiB Firestore Batch Barrier
Firestore strictly enforces:
1. Maximum 10 MiB (10,485,760 bytes) per write transaction or batch request.
2. Maximum 500 document writes per batch.

To eliminate batch overflow failures:
- **Chunk Size:** Maximum 600 KiB per content document (`MAX_PROJECT_CONTENT_CHUNK_BYTES`).
- **Batch Ceiling:** Maximum 8 MiB (8,388,608 bytes) cumulative document payload per batch request, providing a 2 MiB safety margin.
- **Operations Ceiling:** Maximum 400 document writes per batch.

### Generation-Based Atomic Publication
1. **Chunk Ingestion:** Chunks written to subcollection `projects/{projectId}/projectContent/{generation}_{index}` with `ownerId`, `generation`, `index`, and `content`.
2. **Integrity Verification:** Total ingested bytes and chunk counts validated against serialized tree hash.
3. **Atomic Manifest Update:** Parent project document updated with:
   - `fileStorageVersion: 2`
   - `fileGeneration: "<generation_uuid>"`
   - `fileChunkCount: N`
   - `fileBytes: B`
   - `fileSnapshotComplete: true`
4. **Garbage Collection:** Background cleaner purges orphaned chunks from retired generations.

---

## 3. Tool Approval & Security Fencing State Machine

Privileged tools (`run_command`, `deploy_production`) require explicit approval tokens.

```
       +-----------------------+
       | Agent Calls Tool      |
       +-----------+-----------+
                   |
     Tool requires approval?
      /                 \
    No                   Yes
    /                     \
   v                       v
Execute Tool        Has approvalToken?
                     /            \
                   No              Yes
                   /                \
                  v                  v
         Return 403 / Pending    Verify Token:
         "Approval Required"     - HMAC Signature Valid?
                                 - Not Expired?
                                 - Args Hash Matches?
                                 - Single-use Nonce Unseen?
                                  /                     \
                                No                       Yes
                                /                         \
                               v                           v
                       Reject Execution            Mark Nonce Consumed
                       (Tamper/Replay)             Execute in Sandbox
```
