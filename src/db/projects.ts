import { db } from './index.ts';
import { projects } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export async function getUserProjects(userId: string) {
  try {
    return await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
  } catch (error) {
    console.error('Database query failed for getUserProjects:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createProjectRecord(params: {
  projectId: string;
  userId: string;
  name: string;
  description?: string;
  metadata?: any;
}) {
  try {
    const result = await db
      .insert(projects)
      .values({
        projectId: params.projectId,
        userId: params.userId,
        name: params.name,
        description: params.description || null,
        metadata: params.metadata || {},
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed for createProjectRecord:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
