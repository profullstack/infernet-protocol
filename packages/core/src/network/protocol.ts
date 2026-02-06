import type { Libp2p } from 'libp2p';
import { fromString, toString } from 'uint8arrays';
import type { ProtocolMessage } from '@infernet/shared';

const PROTOCOL_PREFIX = '/infernet';
const PROTOCOL_VERSION = '1.0.0';

export const PROTOCOLS = {
  JOB_BROADCAST: `${PROTOCOL_PREFIX}/job/broadcast/${PROTOCOL_VERSION}`,
  JOB_BID: `${PROTOCOL_PREFIX}/job/bid/${PROTOCOL_VERSION}`,
  JOB_ASSIGN: `${PROTOCOL_PREFIX}/job/assign/${PROTOCOL_VERSION}`,
  JOB_RESULT: `${PROTOCOL_PREFIX}/job/result/${PROTOCOL_VERSION}`,
  JOB_DISPUTE: `${PROTOCOL_PREFIX}/job/dispute/${PROTOCOL_VERSION}`,
  PEER_ANNOUNCE: `${PROTOCOL_PREFIX}/peer/announce/${PROTOCOL_VERSION}`,
  PEER_QUERY: `${PROTOCOL_PREFIX}/peer/query/${PROTOCOL_VERSION}`,
  REPUTATION: `${PROTOCOL_PREFIX}/reputation/update/${PROTOCOL_VERSION}`,
} as const;

export type MessageHandler = (message: ProtocolMessage, senderPeerId: string) => void | Promise<void>;

/**
 * Protocol messaging layer built on libp2p streams.
 * Handles encoding/decoding and routing of Infernet protocol messages.
 */
export class ProtocolMessaging {
  private node: Libp2p;
  private handlers: Map<string, Set<MessageHandler>> = new Map();

  constructor(node: Libp2p) {
    this.node = node;
  }

  /**
   * Register protocol stream handlers on the node.
   * Call this after the node is started.
   */
  async start(): Promise<void> {
    for (const protocol of Object.values(PROTOCOLS)) {
      await this.node.handle(protocol, async ({ stream, connection }) => {
        try {
          const chunks: Uint8Array[] = [];
          for await (const chunk of stream.source) {
            chunks.push(chunk.subarray());
          }

          const data = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
          let offset = 0;
          for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
          }

          const message: ProtocolMessage = JSON.parse(toString(data, 'utf8'));
          const senderPeerId = connection.remotePeer.toString();

          const handlers = this.handlers.get(message.type);
          if (handlers) {
            for (const handler of handlers) {
              await handler(message, senderPeerId);
            }
          }
        } catch (err) {
          console.error(`[infernet] Error handling protocol message:`, err);
        } finally {
          await stream.close();
        }
      });
    }
  }

  /**
   * Stop all protocol handlers.
   */
  async stop(): Promise<void> {
    for (const protocol of Object.values(PROTOCOLS)) {
      await this.node.unhandle(protocol);
    }
    this.handlers.clear();
  }

  /**
   * Subscribe to a specific message type.
   */
  on(messageType: ProtocolMessage['type'], handler: MessageHandler): void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, new Set());
    }
    this.handlers.get(messageType)!.add(handler);
  }

  /**
   * Unsubscribe from a message type.
   */
  off(messageType: ProtocolMessage['type'], handler: MessageHandler): void {
    this.handlers.get(messageType)?.delete(handler);
  }

  /**
   * Send a message directly to a specific peer.
   */
  async sendTo(peerId: string, message: ProtocolMessage): Promise<void> {
    const protocol = this.getProtocolForMessage(message);
    const { peerIdFromString } = await import('@libp2p/peer-id');
    const remotePeerId = peerIdFromString(peerId);

    const stream = await this.node.dialProtocol(remotePeerId, protocol);
    const encoded = fromString(JSON.stringify(message), 'utf8');

    await stream.sink([encoded]);
    await stream.close();
  }

  /**
   * Broadcast a message to all connected peers.
   */
  async broadcast(message: ProtocolMessage): Promise<void> {
    const peers = this.node.getPeers();
    const results = await Promise.allSettled(
      peers.map((peerId) => this.sendTo(peerId.toString(), message))
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`[infernet] Failed to broadcast to ${failures.length}/${peers.length} peers`);
    }
  }

  private getProtocolForMessage(message: ProtocolMessage): string {
    const map: Record<ProtocolMessage['type'], string> = {
      'job:broadcast': PROTOCOLS.JOB_BROADCAST,
      'job:bid': PROTOCOLS.JOB_BID,
      'job:assign': PROTOCOLS.JOB_ASSIGN,
      'job:result': PROTOCOLS.JOB_RESULT,
      'job:dispute': PROTOCOLS.JOB_DISPUTE,
      'peer:announce': PROTOCOLS.PEER_ANNOUNCE,
      'peer:query': PROTOCOLS.PEER_QUERY,
      'reputation:update': PROTOCOLS.REPUTATION,
    };
    return map[message.type];
  }
}
