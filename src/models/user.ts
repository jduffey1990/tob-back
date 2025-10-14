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