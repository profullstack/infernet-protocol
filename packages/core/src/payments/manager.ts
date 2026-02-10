import { CoinPayClient } from '@profullstack/coinpay';
import type {
  EscrowInfo,
  Payment,
  PaymentChain,
  PaymentCurrency,
} from '@infernet/shared';

export interface CoinPayConfig {
  apiKey: string;
  apiUrl?: string;
  businessId?: string;
}

/**
 * Payment manager using CoinPay Portal for non-custodial crypto payments.
 * Wraps @profullstack/coinpay SDK for escrow-based job payments.
 */
export class PaymentManager {
  private client: CoinPayClient;
  private config: CoinPayConfig;
  private payments: Map<string, Payment> = new Map();
  private escrows: Map<string, EscrowInfo> = new Map();

  constructor(config: CoinPayConfig) {
    this.config = config;
    this.client = new CoinPayClient({
      apiKey: config.apiKey,
      ...(config.apiUrl ? { baseUrl: config.apiUrl } : {}),
    });
  }

  /**
   * Create a payment request via CoinPay.
   */
  async createPayment(params: {
    jobId: string;
    amount: number;
    currency: PaymentCurrency;
    fromPeerId: string;
    toPeerId: string;
  }): Promise<Payment> {
    const chain = currencyToChain(params.currency);

    const result = await this.client.createPayment({
      businessId: this.config.businessId ?? '',
      amount: params.amount,
      currency: 'USD',
      blockchain: params.currency,
      description: `Infernet job ${params.jobId}`,
      metadata: {
        jobId: params.jobId,
        fromPeerId: params.fromPeerId,
        toPeerId: params.toPeerId,
      },
    });

    const paymentData = (result as any).payment ?? result;

    const payment: Payment = {
      id: paymentData.id,
      jobId: params.jobId,
      fromPeerId: params.fromPeerId,
      toPeerId: params.toPeerId,
      amount: params.amount,
      currency: params.currency,
      chain,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.payments.set(payment.id, payment);
    return payment;
  }

  /**
   * Create an escrow for a job using CoinPay's escrow service.
   * Funds are held until the job is verified, then released to the provider.
   */
  async createEscrow(params: {
    jobId: string;
    amount: number;
    chain: PaymentChain;
    depositorAddress: string;
    beneficiaryAddress: string;
    expiresInHours?: number;
  }): Promise<EscrowInfo> {
    const data = await this.client.request('/escrow', {
      method: 'POST',
      body: JSON.stringify({
        chain: params.chain,
        amount: params.amount,
        depositorAddress: params.depositorAddress,
        beneficiaryAddress: params.beneficiaryAddress,
        metadata: { jobId: params.jobId },
        expiresInHours: params.expiresInHours ?? 24,
      }),
    }) as Record<string, any>;

    const escrow: EscrowInfo = {
      id: data.id,
      escrowAddress: data.escrowAddress,
      chain: params.chain,
      amount: params.amount,
      depositorAddress: params.depositorAddress,
      beneficiaryAddress: params.beneficiaryAddress,
      releaseToken: data.releaseToken,
      beneficiaryToken: data.beneficiaryToken,
      status: 'created',
      expiresAt: data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + (params.expiresInHours ?? 24) * 3600_000,
    };

    this.escrows.set(escrow.id, escrow);
    return escrow;
  }

  /**
   * Release escrowed funds to the provider after job completion.
   */
  async releaseEscrow(escrowId: string, releaseToken: string): Promise<void> {
    await this.client.request(`/escrow/${escrowId}/release`, {
      method: 'POST',
      body: JSON.stringify({ releaseToken }),
    });
    const escrow = this.escrows.get(escrowId);
    if (escrow) escrow.status = 'released';
  }

  /**
   * Refund escrowed funds to the depositor.
   */
  async refundEscrow(escrowId: string, releaseToken: string): Promise<void> {
    await this.client.request(`/escrow/${escrowId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ releaseToken }),
    });
    const escrow = this.escrows.get(escrowId);
    if (escrow) escrow.status = 'refunded';
  }

  /**
   * Dispute an escrow if the job result is unsatisfactory.
   */
  async disputeEscrow(escrowId: string, releaseToken: string, reason: string): Promise<void> {
    await this.client.request(`/escrow/${escrowId}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ releaseToken, reason }),
    });
    const escrow = this.escrows.get(escrowId);
    if (escrow) escrow.status = 'disputed';
  }

  /**
   * Get escrow status from CoinPay.
   */
  async getEscrowStatus(escrowId: string): Promise<EscrowInfo | undefined> {
    const cached = this.escrows.get(escrowId);
    if (!cached) return undefined;

    try {
      const result = await this.client.request(`/escrow/${escrowId}`) as Record<string, any>;
      cached.status = result.status;
      return cached;
    } catch {
      return cached;
    }
  }

  /**
   * Get payment status from CoinPay.
   */
  async getPaymentStatus(paymentId: string): Promise<Payment | undefined> {
    const cached = this.payments.get(paymentId);
    if (!cached) return undefined;

    try {
      const result = await this.client.getPayment(paymentId);
      const paymentData = (result as any).payment ?? result;
      cached.status = paymentData.status === 'completed' ? 'released' : cached.status;
      return cached;
    } catch {
      return cached;
    }
  }

  getPayment(id: string): Payment | undefined {
    return this.payments.get(id);
  }

  getEscrow(id: string): EscrowInfo | undefined {
    return this.escrows.get(id);
  }

  getAllPayments(): Payment[] {
    return [...this.payments.values()];
  }

  getAllEscrows(): EscrowInfo[] {
    return [...this.escrows.values()];
  }

  /**
   * Get the underlying CoinPayClient for advanced operations.
   */
  getCoinPayClient(): CoinPayClient {
    return this.client;
  }
}

function currencyToChain(currency: PaymentCurrency): PaymentChain {
  const map: Record<PaymentCurrency, PaymentChain> = {
    BTC: 'BTC',
    ETH: 'ETH',
    SOL: 'SOL',
    POL: 'POL',
    BCH: 'BCH',
    USDC_ETH: 'ETH',
    USDC_POL: 'POL',
    USDC_SOL: 'SOL',
  };
  return map[currency];
}
