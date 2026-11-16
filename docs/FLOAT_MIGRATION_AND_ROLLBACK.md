# FLOAT STUDIO — MIGRATION AND ROLLBACK SPECIFICATION

**Specification Version:** v1.2.2  
**Database Storage Model:** Cloud Firestore Project Snapshots (Version 1 to Version 2)  

---

## 1. Storage Version 1 vs Version 2 Overview

### Legacy Storage (Version 1)
- **Format:** Single serialized JSON string stored directly on the project document (`projectData.files`).
- **Limitation:** Fails on any project whose serialized file tree exceeds 1,048,576 bytes (1 MiB Firestore document limit).

### Canonical Storage (Version 2)
- **Format:** Chunked subcollection documents with generation fencing and byte-budgeted write batching.
- **Path:** `projects/{projectId}/projectContent/{generation}_{index}`
- **Manifest:** Attached to the parent project document:
  - `fileStorageVersion: 2`
  - `fileGeneration: "<generation_id>"`
  - `fileChunkCount: <number>`
  - `fileBytes: <number>`
  - `fileSnapshotComplete: true`
- **Safety Ceiling:** Writes committed in batches strictly under 8 MiB (preventing Firestore 10 MiB limit breaches) and max 400 documents per batch.

---

## 2. Zero-Downtime Migration Procedure

1. **Dual-Reader Compatibility:**
   `loadProjectFileTreeAdmin()` inspects `projectData.fileStorageVersion`:
   - If `fileStorageVersion === 2`, queries generation chunks from `projectContent`.
   - If `fileStorageVersion` is absent or 1, parses `projectData.files` using `parseLegacyProjectFileTree()`.
   - Existing legacy projects load seamlessly without upfront bulk migration.

2. **On-Save Upgrade:**
   When a user saves or syncs an existing workspace:
   - Serializer splits the file tree into chunks under 600 KiB.
   - Chunks are written to the `projectContent` subcollection in byte-budgeted batches.
   - Once all chunks are committed and validated, the manifest is written to the project document with `fileStorageVersion: 2`.
   - The legacy `files` field is retired.

---

## 3. Rollback Procedure

If a deployed server encounters issues with generation chunking:
1. **Application Code Rollback:** Deploy previous server artifact (`git checkout <previous_sha>`).
2. **Backward Compatibility:** Previous server code continues to read legacy projects normally.
3. **Emergency Downgrade Script:** For any project upgraded to v2 during testing:
   ```typescript
   import { loadProjectFileTreeAdmin } from './src/server/projectContent';
   import { adminDb } from './src/server/adminFirebase';

   async function downgradeProjectToV1(projectId: string) {
     const doc = await adminDb.collection('projects').doc(projectId).get();
     const data = doc.data();
     if (data?.fileStorageVersion === 2) {
       const tree = await loadProjectFileTreeAdmin(projectId, data);
       await doc.ref.update({
         files: JSON.stringify(tree),
         fileStorageVersion: 1,
       });
     }
   }
   ```
4. **Data Isolation:** V2 chunks remain preserved in `projectContent` and are not overwritten during downgrade.
