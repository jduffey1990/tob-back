export interface Flock {
  id: string;
  leaderUserId: string;
  name: string;
  qrCodeIdentifier: string;
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
  joinedAt: Date;
}

export interface FlockPrayer {
  id: string;
  flockId: string;
  createdBy: string;
  title: string;
  text: string;
  audioUrl: string | null;
  voiceId: string | null;
  voiceName: string | null;
  provider: string | null;
  listenCount: number;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlockPrayerWithLeader extends FlockPrayer {
  leaderName: string;
  flockName: string;
}

export interface CreateFlockInput {
  leaderUserId: string;
  name: string;
}

export interface CreateFlockPrayerInput {
  flockId: string;
  createdBy: string;
  title: string;
  text: string;
  voiceId?: string;
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
  createdAt: Date;
}
