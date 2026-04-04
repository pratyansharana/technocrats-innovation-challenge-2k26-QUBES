export type Bit = 0 | 1;
export type Basis = "X" | "+";

export interface QuantumExchangeResponse {
  success: boolean;
  aliceBits: Bit[];
  aliceBases: Basis[];
  photonsForBob: number[];
  error?: string;
}

const API_BASE = (process.env.REACT_APP_QUANTUM_API_BASE || "https://qubesapi.vercel.app/api").replace(/\/$/, "");

export const QuantumKeyService = {
  async generateAndTransmit(length: number = 256, eveActive: boolean = false): Promise<QuantumExchangeResponse> {
    const fullUrl = `${API_BASE}/quantum_channel`;

    try {
      const aliceBits: Bit[] = Array.from({ length }, () => (Math.random() > 0.5 ? 1 : 0));
      const aliceBases: Basis[] = Array.from({ length }, () => (Math.random() > 0.5 ? "X" : "+"));

      const response = await fetch(fullUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bits: aliceBits,
          bases: aliceBases,
          eavesdropperActive: eveActive,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Quantum channel failed (${response.status}): ${errorBody}`);
      }

      const data: { received_states?: number[] } = await response.json();

      return {
        success: true,
        aliceBits,
        aliceBases,
        photonsForBob: data.received_states || [],
      };
    } catch (error) {
      return {
        success: false,
        aliceBits: [],
        aliceBases: [],
        photonsForBob: [],
        error: error instanceof Error ? error.message : "Unknown quantum channel error",
      };
    }
  },

  deriveFinalKey(bits: Bit[], myBases: Basis[], theirBases: Basis[]): Bit[] {
    const siftedKey: Bit[] = [];
    for (let i = 0; i < myBases.length; i += 1) {
      if (myBases[i] === theirBases[i]) {
        siftedKey.push(bits[i]);
      }
    }
    return siftedKey;
  },

  formatToHex(rawBits: Bit[]): string {
    let targetBits = [...rawBits];

    if (targetBits.length > 256) {
      targetBits = targetBits.slice(0, 256);
    }
    while (targetBits.length < 256) {
      targetBits.push(0);
    }

    let hexString = "";
    for (let i = 0; i < targetBits.length; i += 4) {
      const chunk = targetBits.slice(i, i + 4).join("");
      hexString += parseInt(chunk, 2).toString(16);
    }

    return hexString;
  },
};
