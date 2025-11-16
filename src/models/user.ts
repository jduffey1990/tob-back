// src/models/user.ts
export interface User {
  id: string;                // uuid
  companyId?: string | null; // uuid or null
  email: string;
  passwordHash: string;      // store hash, never raw password
  name: string;
  status: string;            // e.g., 'active' | 'invited' | 'disabled'
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserSafe = Omit<User, 'passwordHash'>;

export interface ActivationToken {
  id: string;                // uuid
  userId: string;            // uuid - foreign key to users table
  email: string;             // redundant but useful for quick lookups
  token: string;             // hex token (64 chars)
  expiresAt: Date;           // when this token becomes invalid
  createdAt: Date;
  usedAt?: Date | null;      // tracks if/when token was used (for auditing)
}
