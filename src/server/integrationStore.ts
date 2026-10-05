import crypto from 'crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import { adminDb } from './adminFirebase';

export interface StoredIntegrationConnection {
  id: string;
  userId: string;
  provider: string;
  status: 'connected' | 'error' | 'expired';
  accountId: string;
  accountName: string;
  avatarUrl?: string;
  profileUrl?: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  createdAt: number;
  lastVerifiedAt: number;
}

export interface OAuthStateRecord {
  state: string;
  provider: 'github' | 'gitlab';
  userId: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}

const connections = () => adminDb.collection('integrationConnections');
const states = () => adminDb.collection('integrationOAuthStates');
const recordId = (provider: string, userId: string) =>
  crypto.createHash('sha256').update(`${provider}:${userId}`).digest('hex');

function encryptionKey(): Buffer {
  const encoded = process.env.FLOAT_OAUTH_ENCRYPTION_KEY || '';
  const key = Buffer.from(encoded, 'base64');
  if (!encoded || key.length !== 32) {
    throw new Error('FLOAT_OAUTH_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

function encrypt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decrypt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [ivValue, tagValue, ciphertextValue] = value.split('.');
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Stored integration token is malformed.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function fromDocument(data: DocumentData): StoredIntegrationConnection {
  const { accessTokenEncrypted, refreshTokenEncrypted, ...metadata } = data;
  return {
    ...metadata,
    accessToken: decrypt(accessTokenEncrypted) || '',
    refreshToken: decrypt(refreshTokenEncrypted),
  } as StoredIntegrationConnection;
}

export async function getIntegrationConnection(userId: string, provider: string): Promise<StoredIntegrationConnection | null> {
  const snapshot = await connections().doc(recordId(provider, userId)).get();
  return snapshot.exists ? fromDocument(snapshot.data()!) : null;
}

export async function listIntegrationConnections(userId: string): Promise<StoredIntegrationConnection[]> {
  const snapshot = await connections().where('userId', '==', userId).get();
  return snapshot.docs.map((document) => fromDocument(document.data()));
}

export async function saveIntegrationConnection(connection: StoredIntegrationConnection): Promise<void> {
  const { accessToken, refreshToken, ...metadata } = connection;
  await connections().doc(recordId(connection.provider, connection.userId)).set({
    ...metadata,
    accessTokenEncrypted: encrypt(accessToken),
    refreshTokenEncrypted: encrypt(refreshToken),
  });
}

export async function deleteIntegrationConnection(userId: string, id: string): Promise<StoredIntegrationConnection | null> {
  const snapshot = await connections().where('userId', '==', userId).where('id', '==', id).limit(1).get();
  const document = snapshot.docs[0];
  if (!document) return null;
  const connection = fromDocument(document.data());
  await document.ref.delete();
  return connection;
}

export async function saveOAuthState(record: OAuthStateRecord): Promise<void> {
  await states().doc(record.state).set(record);
}

/** Atomically consumes OAuth state so it cannot be replayed across instances. */
export async function consumeOAuthState(state: string): Promise<OAuthStateRecord | null> {
  const reference = states().doc(state);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return null;
    transaction.delete(reference);
    const record = snapshot.data() as OAuthStateRecord;
    return record.expiresAt >= Date.now() ? record : null;
  });
}
