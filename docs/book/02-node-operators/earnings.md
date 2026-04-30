# Earnings

## How Payments Work

Every completed inference job generates a **Compute Payment Receipt (CPR)**. A CPR is a signed record that proves your node completed a specific job: it includes the job ID, token count, model used, your node's public key, the client's public key, and an on-chain settlement value.

CPRs accumulate in your node's account on the control plane. When you run `infernet payout`, the pending CPRs are aggregated into an on-chain transaction that transfers the earned amount to your payout wallet.

## Checking Your Balance

```bash
infernet status
# Shows: Earnings: 12.84 USDC (unclaimed)
```

For more detail:

```bash
infernet payments
```

```
Earnings Summary
================
Unclaimed balance:  12.84 USDC
Paid out (lifetime): 847.22 USDC

Recent jobs (last 24h):
  job_9a3f2c1d  qwen2.5:14b  312 tokens  0.0031 USDC  2026-04-30 14:23
  job_8b2e1c3a  llama3.2:3b   89 tokens  0.0009 USDC  2026-04-30 14:19
  job_7c1d4b2f  qwen2.5:14b  891 tokens  0.0089 USDC  2026-04-30 14:11
  ...

Total today: 142 jobs, 0.9182 USDC
```

You can also see this in the dashboard under **Earnings** → **Ledger**.

## Setting Your Payout Address

Before you can receive payments, set your payout wallet address:

```bash
infernet payout --set-address 0xYourWalletAddressHere
```

Or edit `~/.infernet/config.json` directly:

```json
{
  "payout_address": "0xYourWalletAddressHere"
}
```

The address must be valid for the chain you want to receive payment on. Infernet supports multiple chains — specify which chain when setting the address:

```bash
# Ethereum mainnet
infernet payout --set-address 0x... --chain ethereum

# Base
infernet payout --set-address 0x... --chain base

# Solana
infernet payout --set-address YourSolanaPublicKey --chain solana
```

The address is sent to the control plane on the next heartbeat and appears in the dashboard under **Settings → Payout Address**.

## Claiming Earnings

```bash
infernet payout
```

This initiates an on-chain settlement for your current unclaimed balance. The process:

1. The CLI requests a payout from the control plane
2. The control plane aggregates all pending CPRs for your node
3. An on-chain transaction is submitted to transfer the balance to your payout address
4. The CLI waits for confirmation and shows the transaction hash

```
Initiating payout...
  Unclaimed balance: 12.84 USDC
  Destination: 0x1234...abcd
  Chain: base
  
Submitting transaction...
  Tx hash: 0xabc123...
  Waiting for confirmation...
  
Confirmed! (block 14298741)
12.84 USDC transferred to 0x1234...abcd
```

Payout transactions typically confirm within 5–30 seconds on Base, a few minutes on Ethereum mainnet.

## Payout Minimums

There's a minimum payout threshold to avoid spending more on gas than you earn. The minimum varies by chain:

| Chain | Minimum Payout |
|-------|---------------|
| Base | 1.00 USDC |
| Ethereum | 10.00 USDC |
| Polygon | 1.00 USDC |
| Solana | 1.00 USDC |

If your balance is below the minimum, the payout command will tell you and exit without submitting a transaction.

## Pricing Per Job

Job pricing is set by the network based on:

- **Model**: larger models cost more per token
- **Token count**: output tokens + input tokens, weighted (output costs ~4x more)
- **Tier premium**: `>=48gb` tier nodes earn a small premium for serving models others can't

Current approximate rates (subject to network demand):

| Model Size | Rate (per 1K output tokens) |
|------------|----------------------------|
| 1B–3B | $0.001 |
| 7B | $0.002 |
| 13B–14B | $0.005 |
| 30B–33B | $0.012 |
| 70B+ | $0.025 |

These rates are illustrative. The actual network rate is visible in the dashboard under **Earnings → Pricing**.

## Automated Payouts

You can schedule automatic payouts via cron. The `--auto` flag runs the payout non-interactively and only if the balance meets the minimum:

```bash
# Claim earnings every day at midnight
0 0 * * * /usr/local/bin/infernet payout --auto >> /var/log/infernet-payout.log 2>&1
```

Or configure auto-payout in `~/.infernet/config.json`:

```json
{
  "auto_payout": true,
  "auto_payout_threshold": 5.0,
  "auto_payout_schedule": "daily"
}
```

Valid schedule values: `"hourly"`, `"daily"`, `"weekly"`.

## Payment Security

Payments are cryptographically tied to your node's keypair. A CPR is only valid if it's signed by the node that executed the job. The control plane verifies the signature before issuing the on-chain transaction.

This means: even if someone gains access to your payout wallet address, they can't forge CPRs or claim earnings that aren't yours. And even if someone gains access to the control plane, they can't redirect your earnings because the on-chain transaction requires a valid CPR signature.

Keep your node's private key (`~/.infernet/keys/node.key`) secure. Back it up somewhere safe. If you lose it, you can't claim any pending unclaimed earnings, and you'll need to re-register with a new keypair.
