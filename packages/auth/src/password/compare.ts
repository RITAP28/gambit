import * as bcrypt from "bcrypt";

export const comparePassword = (plaintext: string, hash: string): Promise<boolean> =>
    bcrypt.compare(plaintext, hash);
