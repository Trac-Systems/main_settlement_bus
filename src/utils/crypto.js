import b4a from "b4a";
import { blake3 } from "@tracsystems/blake3";

export async function blake3Hash(input, hashLength = 32) {
  if (typeof input === "string") {
    input = b4a.from(input, "utf8");
  }

  const hashBytes = await blake3(input, hashLength);
  return b4a.from(hashBytes);
}
