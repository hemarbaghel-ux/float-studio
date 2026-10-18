import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Users table keyed by Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Projects table storing user workspace projects
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  projectId: text('project_id').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => users.uid),
  name: text('name').notNull(),
  description: text('description'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.uid],
  }),
}));
