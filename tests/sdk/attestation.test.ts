import {
  MPC_FAILURE_OUTPUT,
  pureCircuits,
  requestIdBytes,
  type RequestIdHex,
  requestIdHex,
  respondBidirectionalEventToCircuitInput,
  serializeRespondOutput,
  verifyRespondBidirectionalSignature,
} from "@sig-net/midnight";
import {
  calculateSignetAttestationDigest,
  ecdsaSignatureToMpcSignature,
  secp256k1PublicKeyOf,
  signAttestationDigest,
} from "@sig-net/midnight/testing";
import { describe, expect, it } from "vitest";

const requestId: RequestIdHex = requestIdHex(new Uint8Array(32).fill(0xab));
const secret = new Uint8Array(32).fill(42);
const responseKey = secp256k1PublicKeyOf(secret);
const schema = '[{"name":"success","type":"bool"}]';
const successOutput = serializeRespondOutput(schema, { success: true });

function signedResponse(output: Uint8Array): {
  signature: ReturnType<typeof ecdsaSignatureToMpcSignature>;
} {
  const digest = calculateSignetAttestationDigest(requestIdBytes(requestId), output);
  return {
    signature: ecdsaSignatureToMpcSignature(signAttestationDigest(digest, secret)),
  };
}

describe("Signet attestation signatures", () => {
  it("accepts an attested success output and rejects a forged output", () => {
    const event = signedResponse(successOutput);

    expect(
      verifyRespondBidirectionalSignature(
        requestIdBytes(requestId),
        successOutput,
        event,
        responseKey,
      ),
    ).toBe(true);
    expect(
      verifyRespondBidirectionalSignature(
        requestIdBytes(requestId),
        new Uint8Array(32),
        event,
        responseKey,
      ),
    ).toBe(false);
  });

  it("recognises the fixed MPC failure output only when it has its own attestation", () => {
    const event = signedResponse(MPC_FAILURE_OUTPUT);

    expect(
      verifyRespondBidirectionalSignature(
        requestIdBytes(requestId),
        MPC_FAILURE_OUTPUT,
        event,
        responseKey,
      ),
    ).toBe(true);
    expect(
      verifyRespondBidirectionalSignature(
        requestIdBytes(requestId),
        successOutput,
        event,
        responseKey,
      ),
    ).toBe(false);
  });

  it("requires circuit input conversion before circuit event verification", () => {
    const output = new Uint8Array(32).fill(2);
    const event = signedResponse(output);

    expect(
      pureCircuits.verifyRespondBidirectionalEvent32(
        requestIdBytes(requestId),
        output,
        event,
        responseKey,
      ),
    ).toBe(false);
    expect(
      pureCircuits.verifyRespondBidirectionalEvent32(
        requestIdBytes(requestId),
        output,
        respondBidirectionalEventToCircuitInput(event),
        responseKey,
      ),
    ).toBe(true);
  });
});
