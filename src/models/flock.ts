export type FlockStatus = 'active' | 'suspended';

export interface Flock {
  id: string;
  leaderUserId: string;
  name: string;
  qrCodeIdentifier: string;
  requiresAgeVerification: boolean;
  minimumAge: number;
  status: FlockStatus;
  suspendedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlockWithStats extends Flock {
  followerCount: number;
  publishedPrayerCount: number;
}

export interface FlockMember {
  id: string;
  flockId: string;
  memberUserId: string;
  parentalConsentGiven: boolean;
  joinedAt: Date;
}

export interface CreateFlockInput {
  leaderUserId: string;
  name: string;
  requiresAgeVerification?: boolean;
  minimumAge?: number;
}

export interface FollowedLeader {
  flockId: string;
  flockName: string;
  leaderUserId: string;
  leaderName: string;
  joinedAt: Date;
  flockStatus: FlockStatus;
}

export interface FlockPrayerRequest {
  id: string;
  flockId: string;
  memberUserId: string;
  memberName: string;
  name: string;
  category: string | null;
  prayerFocus: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'denied';
  anonymize: boolean;
  createdAt: Date;
}

/** A member as the leader sees them on the roster. */
export interface FlockRosterMember {
  userId: string;
  name: string;
  joinedAt: Date;
  parentalConsentGiven: boolean;
}

export interface FlockBlockedMember {
  userId: string;
  name: string;
  blockedAt: Date;
}

/** Everything the report email needs, captured at report time. */
export interface FlockPrayerReport {
  id: string;
  flockName: string;
  leaderName: string;
  reporterName: string;
  prayerId: string;
  prayerTitle: string;
  prayerText: string;
  reason: string | null;
  /** false when this member had already reported this prayer. */
  isNew: boolean;
}
