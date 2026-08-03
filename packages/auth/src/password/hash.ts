import * as bcrypt from "bcrypt";

/**
 * Work factor for password hashing. 12 is the common floor for new systems;
 * raising it costs login latency, lowering it costs offline-cracking margin.
 */
export const BCRYPT_ROUNDS = 12;

export const hashPassword = (plaintext: string): Promise<string> =>
    bcrypt.hash(plaintext, BCRYPT_ROUNDS);
