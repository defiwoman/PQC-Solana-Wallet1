export interface SignatureRequest { address: string; signing: boolean }

/** Holds only the current public transaction bytes. Earlier verified signatures
 * live in the SDK's fixed-message transaction while accounts are switched. */
export class SignatureQueue {
  private pending?: SignatureRequest & { bytes: Uint8Array; resolve: (bytes: Uint8Array) => void; reject: (cause: Error) => void };
  constructor(private changed: (request?: SignatureRequest) => void) {}
  request(address: string, bytes: Uint8Array): Promise<Uint8Array> {
    if (this.pending) throw new Error('Another signing request is active.');
    return new Promise((resolve, reject) => {
      this.pending = { address, bytes, signing: false, resolve, reject };
      this.changed({ address, signing: false });
    });
  }
  async sign(address: string, signer: (bytes: Uint8Array) => Promise<Uint8Array>) {
    const pending = this.pending;
    if (!pending || pending.signing) return;
    if (pending.address !== address) throw new Error('Switch to the required authorization identity.');
    pending.signing = true; this.changed({ address, signing: true });
    try {
      const result = await signer(pending.bytes);
      if (this.pending !== pending) return; // Cancellation must defeat late wallet responses.
      this.pending = undefined; this.changed(); pending.resolve(result);
    } catch (cause) {
      if (this.pending !== pending) return;
      this.pending = undefined; this.changed(); pending.reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }
  cancel() {
    const pending = this.pending; this.pending = undefined; this.changed();
    pending?.reject(new Error('Signing round cancelled. Start fresh with all three initialization signatures.'));
  }
}
