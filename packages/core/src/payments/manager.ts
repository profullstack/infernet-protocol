import type {
  EscrowInfo,
  Payment,
  PaymentChain,
  PaymentCurrency,
  PaymentStatus,
} from '@infernet/shared';

export interface CoinPayConfig {
  apiKey: string;
  apiUrl: string;
}

/**
 * Payment manager using CoinPay Portal for non-custodial crypto payments.
 * Supports BTC, ETH, SOL, POL, BCH, and USDC on multiple chains.
 */
export class PaymentManager {
  private config: CoinPayConfig;
  private payments: Map<string, Payment> = new Map();

  constructor(config: CoinPayConfig) {
    this.config = config;
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
    webhookUrl?: string;
  }): Promise<Payment> {
    const chain = currencyToChain(params.currency);

    const res = await fetch(`${this.config.apiUrl}/api/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: 'USD',
        cryptocurrency: chain,
        description: `Infernet job ${params.jobId}`,
        webhook_url: params.webhookUrl,
      }),
    });

    if (!res.ok) {
      throw new Error(`CoinPay payment creation failed: ${res.statusText}`);
    }

    const data = await res.json();

    const payment: Payment = {
      id: data.id,
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
    const res = await fetch(`${this.config.apiUrl}/api/escrow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        chain: params.chain,
        amount: params.amount,
        depositor_address: params.depositorAddress,
        beneficiary_address: params.beneficiaryAddress,
        expires_in_hours: params.expiresInHours ?? 48,
      }),
    });

    if (!res.ok) {
      throw new Error(`CoinPay escrow creation failed: ${res.statusText}`);
    }

    const data = await res.json();

    return {
      id: data.id,
      escrowAddress: data.escrow_address,
      chain: params.chain,
      amount: params.amount,
      depositorAddress: params.depositorAddress,
      beneficiaryAddress: params.beneficiaryAddress,
      releaseToken: data.release_token,
      beneficiaryToken: data.beneficiary_token,
      status: 'created',
      expiresAt: Date.now() + (params.expiresInHours ?? 48) * 3600 * 1000,
    };
  }

  /**
   * Release escrowed funds to the provider after job completion.
   */
  async releaseEscrow(escrowId: string, releaseToken: string): Promise<void> {
    const res = await fetch(`${this.config.apiUrl}/api/escrow/${escrowId}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ release_token: releaseToken }),
    });

    if (!res.ok) {
      throw new Error(`CoinPay escrow release failed: ${res.statusText}`);
    }
  }

  /**
   * Dispute an escrow if the job result is unsatisfactory.
   */
  async disputeEscrow(escrowId: string, releaseToken: string, reason: string): Promise<void> {
    const res = await fetch(`${this.config.apiUrl}/api/escrow/${escrowId}/dispute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ release_token: releaseToken, reason }),
    });

    if (!res.ok) {
      throw new Error(`CoinPay escrow dispute failed: ${res.statusText}`);
    }
  }

  getPayment(id: string): Payment | undefined {
    return this.payments.get(id);
  }

  getAllPayments(): Payment[] {
    return [...this.payments.values()];
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
