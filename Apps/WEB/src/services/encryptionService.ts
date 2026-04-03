import CryptoJS from 'crypto-js';
import type { Bit } from './quantumService';

export class EncryptionService {
  static bitsToHex(bits: Bit[]): string {
    let targetBits = [...bits];

    if (targetBits.length > 256) {
      targetBits = targetBits.slice(0, 256);
    }
    while (targetBits.length < 256) {
      targetBits.push(0);
    }

    let hexString = '';
    for (let i = 0; i < targetBits.length; i += 4) {
      const chunk = targetBits.slice(i, i + 4).join('');
      const hexChar = parseInt(chunk, 2).toString(16);
      hexString += hexChar;
    }

    return hexString;
  }

  static encrypt(plaintext: string, keyHex: string): string {
    const encrypted = CryptoJS.AES.encrypt(plaintext, keyHex);
    return encrypted.toString();
  }

  static decrypt(ciphertext: string, keyHex: string): string | null {
    const decrypted = CryptoJS.AES.decrypt(ciphertext, keyHex);
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    return plaintext || null;
  }

  static generateIV(): string {
    return CryptoJS.lib.WordArray.random(128 / 8).toString();
  }
}
