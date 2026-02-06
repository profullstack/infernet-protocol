import type { PeerInfo, NodeCapabilities, ReputationRecord } from '@infernet/shared';
import type { ProtocolMessaging } from '../network/protocol.js';

/**
 * Manages local node identity, peer tracking, and P2P reputation.
 * Reputation is gossip-based — nodes share scores with each other.
 */
export class IdentityManager {
  private localPeerId: string;
  private peers: Map<string, PeerInfo> = new Map();
  private reputation: Map<string, ReputationRecord> = new Map();
  private messaging: ProtocolMessaging;

  constructor(messaging: ProtocolMessaging, localPeerId: string) {
    this.messaging = messaging;
    this.localPeerId = localPeerId;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.messaging.on('peer:announce', (msg) => {
      if (msg.type !== 'peer:announce') return;
      this.peers.set(msg.peer.peerId, msg.peer);
    });

    this.messaging.on('reputation:update', (msg) => {
      if (msg.type !== 'reputation:update') return;
      this.updateReputation(msg.peerId, msg.score, msg.jobId);
    });
  }

  /**
   * Announce this node's presence and capabilities to the network.
   */
  async announcePresence(capabilities: NodeCapabilities, multiaddrs: string[]): Promise<void> {
    const peer: PeerInfo = {
      peerId: this.localPeerId,
      multiaddrs,
      publicKey: new Uint8Array(), // filled by libp2p
      capabilities,
      reputation: this.getReputationScore(this.localPeerId),
      joinedAt: Date.now(),
    };

    this.peers.set(this.localPeerId, peer);

    await this.messaging.broadcast({
      type: 'peer:announce',
      peer,
      timestamp: Date.now(),
    });
  }

  /**
   * Update reputation for a peer after a job interaction.
   */
  private updateReputation(peerId: string, score: number, jobId: string): void {
    const existing = this.reputation.get(peerId) ?? {
      peerId,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      disputedJobs: 0,
      averageScore: 0,
      totalEarned: {},
      lastActiveAt: 0,
    };

    existing.totalJobs += 1;
    if (score >= 3) existing.completedJobs += 1;
    else existing.failedJobs += 1;

    // Rolling average
    existing.averageScore =
      (existing.averageScore * (existing.totalJobs - 1) + score) / existing.totalJobs;
    existing.lastActiveAt = Date.now();

    this.reputation.set(peerId, existing);
  }

  /**
   * Submit a reputation score for a peer (broadcasts to network).
   */
  async ratePeer(peerId: string, jobId: string, score: number, feedback?: string): Promise<void> {
    if (score < 1 || score > 5) throw new Error('Score must be between 1 and 5');

    this.updateReputation(peerId, score, jobId);

    await this.messaging.broadcast({
      type: 'reputation:update',
      peerId,
      jobId,
      score,
      feedback,
      timestamp: Date.now(),
    });
  }

  getReputationScore(peerId: string): number {
    return this.reputation.get(peerId)?.averageScore ?? 0;
  }

  getReputation(peerId: string): ReputationRecord | undefined {
    return this.reputation.get(peerId);
  }

  getPeer(peerId: string): PeerInfo | undefined {
    return this.peers.get(peerId);
  }

  getAllPeers(): PeerInfo[] {
    return [...this.peers.values()];
  }

  getProviders(minReputation = 0): PeerInfo[] {
    return [...this.peers.values()].filter(
      (p) => p.peerId !== this.localPeerId && p.reputation >= minReputation
    );
  }
}
