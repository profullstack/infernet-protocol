import "server-only";

/**
 * IPIP-0007 phase 1 — build the platform DID document.
 *
 * Resolves to `did:web:<host>` where `<host>` comes from
 * NEXT_PUBLIC_APP_URL. Lists one verification key (Ed25519, MultiBase
 * encoded) and one CPRIssuer service endpoint pointing at our CPR API.
 *
 * Anyone can fetch this at /.well-known/did.json and verify a Receipt
 * that claims to be issued by this platform.
 *
 * The verification key comes from env so a self-host operator's
 * `did:web:<their-domain>` resolves to their own key, not ours.
 */

const DID_VERIFICATION_KEY_ENV = "DID_VERIFICATION_KEY";

/**
 * Strip `https://` / `http://` and any trailing slash from an app URL.
 * `did:web:` is a host (with optional port + path), not a URL.
 */
function appUrlToDidHost(appUrl) {
    if (!appUrl) return "infernetprotocol.com";
    let s = String(appUrl).trim();
    s = s.replace(/^https?:\/\//, "");
    s = s.replace(/\/+$/, "");
    return s;
}

/**
 * @param {{ appUrl?: string, verificationKey?: string }} [opts]
 */
export function buildDidDocument(opts = {}) {
    const appUrl = opts.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com";
    const host = appUrlToDidHost(appUrl);
    const did = `did:web:${host}`;

    const verificationKey =
        opts.verificationKey ??
        process.env[DID_VERIFICATION_KEY_ENV] ??
        // Placeholder until provisioned. Real deployments MUST set the env.
        "z6MkPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDER";

    return {
        "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1"
        ],
        id: did,
        verificationMethod: [
            {
                id: `${did}#key-1`,
                type: "Ed25519VerificationKey2020",
                controller: did,
                publicKeyMultibase: verificationKey
            }
        ],
        authentication: [`${did}#key-1`],
        assertionMethod: [`${did}#key-1`],
        service: [
            {
                id: `${did}#cpr`,
                type: "CPRIssuer",
                serviceEndpoint: `${appUrl.replace(/\/+$/, "")}/api/cpr`
            },
            {
                id: `${did}#api`,
                type: "InfernetControlPlane",
                serviceEndpoint: `${appUrl.replace(/\/+$/, "")}/api/v1`
            }
        ]
    };
}

export const __testables__ = {
    appUrlToDidHost,
    DID_VERIFICATION_KEY_ENV
};
