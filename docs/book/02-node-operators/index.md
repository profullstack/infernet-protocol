# Chapter 2: Node Operators

Running a node is how you contribute compute to the network and earn crypto. This chapter covers everything from hardware selection through daily operations.

---

## In This Chapter

- [Requirements](requirements.md) — GPU tiers, RAM, bandwidth, and OS requirements. What hardware you can use and what to expect from each tier.
- [Installation](installation.md) — Full install walkthrough: the curl installer, `infernet setup`, firewall rules, and running the daemon as a system service.
- [Model Management](model-management.md) — Installing and removing models via the CLI and dashboard. How the daemon serves models and polls for updates.
- [Monitoring](monitoring.md) — `infernet logs`, `infernet status`, `infernet doctor`, and what the dashboard shows you about your node's health.
- [Earnings](earnings.md) — How payments work per job, how to check your balance, and how to run `infernet payout` to claim earnings.

---

## The Operator's Day-to-Day

Once your node is set up, operating it is mostly passive. The daemon runs in the background, accepts jobs automatically, and earns payments without your involvement. The main active tasks are:

- **Managing your model inventory**: adding new models when clients request them, removing models you're not getting jobs for to free VRAM.
- **Monitoring node health**: checking logs when something looks wrong, running `infernet doctor` when the node goes offline unexpectedly.
- **Claiming earnings**: running `infernet payout` periodically to move accumulated earnings to your wallet.
- **Keeping software current**: running `infernet upgrade` when new CLI versions are released.

The rest of this chapter covers each of these in detail.
