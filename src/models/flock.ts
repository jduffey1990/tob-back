export interface Flock {
  id: string;
  leaderUserId: string;
  name: string;
  qrCodeIdentifier: string;
  requiresAgeVerification: boolean;
  minimumAge: number;
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
  createdAt: Date;
}
