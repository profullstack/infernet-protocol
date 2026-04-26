import { NextResponse } from "next/server";
import { buildDidDocument } from "@/lib/data/did-document";
import { handleRoute } from "@/lib/http";

/**
 * IPIP-0007 phase 1 — DID document for `did:web:<host>`.
 *
 * Served at the well-known location every did:web resolver expects:
 *   https://<host>/.well-known/did.json
 *
 * Public, cacheable. Anyone verifying a CPR Receipt issued by this
 * platform fetches this document, picks the verification key, and
 * verifies the signature.
 *
 * Self-host operators get their own DID document automatically — the
 * route reads NEXT_PUBLIC_APP_URL + DID_VERIFICATION_KEY at request
 * time, so deploying at `https://acme-corp-infernet.com` produces
 * `did:web:acme-corp-infernet.com` with no code change.
 */
export async function GET() {
    return handleRoute(async () => {
        const doc = buildDidDocument();
        const res = NextResponse.json(doc);
        // Public DID documents are stable and cache-friendly.
        res.headers.set("cache-control", "public, max-age=300, stale-while-revalidate=86400");
        return res;
    });
}
