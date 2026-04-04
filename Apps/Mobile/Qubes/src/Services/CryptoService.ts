
import CryptoJS from 'crypto-js';

export type Bit = 0 | 1;

export const CryptoService = {

  formatKeyForAES: (rawBits: Bit[]): string => {
    // 1. Ensure we have exactly 256 bits
    let targetBits = [...rawBits];
    if (targetBits.length > 256) targetBits = targetBits.slice(0, 256);
    while (targetBits.length < 256) targetBits.push(0); 

    let hexString = '';
    for (let i = 0; i < targetBits.length; i += 4) {
      const chunk = targetBits.slice(i, i + 4).join('');
      // Convert binary to hex and ensure it always takes up 1 character
      const hexChar = parseInt(chunk, 2).toString(16);
      hexString += hexChar;
    }
    
    return hexString;
  },

  encryptMessage: (message: string, hexKey: string): string => {
    try {
      const key = CryptoJS.enc.Hex.parse(hexKey);
      const encrypted = CryptoJS.AES.encrypt(message, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
      });
      return encrypted.toString();
    } catch (e) {
      console.error("Encryption Error:", e);
      return "";
    }
  },

  decryptMessage: (ciphertext: string, hexKey: string): string => {
    try {
      const key = CryptoJS.enc.Hex.parse(hexKey);
      const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
      });
      
      const result = decrypted.toString(CryptoJS.enc.Utf8);
      if (!result) throw new Error("Empty decryption result");
      return result;
    } catch (error) {
      // This is helpful for debugging the BB84 handshake
      return "🚨 Decryption Error: Key mismatch or tampered data.";
    }
  }
};