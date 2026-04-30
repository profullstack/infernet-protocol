import { describe, it, expect } from "vitest";
import { generateKeyPair } from "@infernetprotocol/auth";
import { getConversationKey, encrypt, decrypt } from "../apps/web/lib/nip44.js";

describe("NIP-44 v2", () => {
    it("ECDH is symmetric — both sides derive the same conversation key", () => {
        const a = generateKeyPair();
        const b = generateKeyPair();

        const keyAB = getConversationKey(a.privateKey, b.publicKey);
        const keyBA = getConversationKey(b.privateKey, a.publicKey);

        expect(Buffer.from(keyAB).toString("hex")).toBe(Buffer.from(keyBA).toString("hex"));
    });

    it("encrypt → decrypt round-trips plaintext", () => {
        const a = generateKeyPair();
        const b = generateKeyPair();
        const convKey = getConversationKey(a.privateKey, b.publicKey);

        const plain = "Hello from the P2P GPU network";
        const ciphertext = encrypt(convKey, plain);

        expect(typeof ciphertext).toBe("string");
        expect(ciphertext).not.toContain(plain);

        const recovered = decrypt(convKey, ciphertext);
        expect(recovered).toBe(plain);
    });

    it("decrypt throws on tampered ciphertext (MAC failure)", () => {
        const a = generateKeyPair();
        const b = generateKeyPair();
        const convKey = getConversationKey(a.privateKey, b.publicKey);

        const ciphertext = encrypt(convKey, "secret payload");
        // Flip one character in the middle of the base64 to corrupt a byte.
        const mid = Math.floor(ciphertext.length / 2);
        const tampered = ciphertext.slice(0, mid) + (ciphertext[mid] === "A" ? "B" : "A") + ciphertext.slice(mid + 1);

        expect(() => decrypt(convKey, tampered)).toThrow(/authentication failed|nip44/i);
    });

    it("decrypt throws on wrong conversation key", () => {
        const a = generateKeyPair();
        const b = generateKeyPair();
        const c = generateKeyPair();

        const keyAB = getConversationKey(a.privateKey, b.publicKey);
        const keyAC = getConversationKey(a.privateKey, c.publicKey); // wrong key

        const ciphertext = encrypt(keyAB, "top secret");

        expect(() => decrypt(keyAC, ciphertext)).toThrow(/authentication failed|nip44/i);
    });

    it("each call produces a different ciphertext (nonce is random)", () => {
        const a = generateKeyPair();
        const b = generateKeyPair();
        const convKey = getConversationKey(a.privateKey, b.publicKey);

        const c1 = encrypt(convKey, "same");
        const c2 = encrypt(convKey, "same");
        expect(c1).not.toBe(c2);
    });

    it("round-trips JSON messages (the actual chat use-case)", () => {
        const consumer = generateKeyPair();
        const provider = generateKeyPair();

        const encryptKey = getConversationKey(consumer.privateKey, provider.publicKey);
        const decryptKey = getConversationKey(provider.privateKey, consumer.publicKey);

        const messages = [
            { role: "user", content: "What is 2 + 2?" },
            { role: "assistant", content: "4." }
        ];

        const encrypted = encrypt(encryptKey, JSON.stringify(messages));
        const decrypted = JSON.parse(decrypt(decryptKey, encrypted));

        expect(decrypted).toEqual(messages);
    });

    it("daemon re-encrypt: token encrypted by provider decrypts correctly by consumer", () => {
        // Mirrors the daemon EventBuffer pattern: provider re-encrypts token data
        // using the same conversation key, consumer decrypts on the SSE side.
        const consumer = generateKeyPair();
        const provider = generateKeyPair();

        const consumerKey = getConversationKey(consumer.privateKey, provider.publicKey);
        const providerKey = getConversationKey(provider.privateKey, consumer.publicKey);

        // Provider encrypts a token chunk.
        const tokenData = JSON.stringify({ text: " Hello" });
        const encryptedToken = encrypt(providerKey, tokenData);

        // Consumer decrypts it.
        const recovered = JSON.parse(decrypt(consumerKey, encryptedToken));
        expect(recovered.text).toBe(" Hello");
    });
});
