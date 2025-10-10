import b4a from "b4a"

export function decodeBase64Payload(base64) {
  let decodedPayloadString
  try {
    decodedPayloadString = b4a.from(base64, "base64").toString("utf-8")
  } catch (err) {
    throw new Error("Failed to decode base64 payload.")
  }

  try {
    return JSON.parse(decodedPayloadString)
  } catch (err) {
    throw new Error("Decoded payload is not valid JSON.")
  }
}

export function isBase64(str) {
  const base64Regex =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
  return base64Regex.test(str)
}

export function validatePayloadStructure(payload) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.type !== "number" ||
    typeof payload.address !== "string" ||
    typeof payload.tro !== "object"
  ) {
    throw new Error("Invalid payload structure.")
  }
}

export function sanitizeTransferPayload(payload) {
  if (payload.address && typeof payload.address === "string") {
    payload.address = payload.address.trim()
  }

  if (payload.tro && typeof payload.tro === "object") {
    for (const [key, value] of Object.entries(payload.tro)) {
      if (typeof value === "string") {
        let sanitized = value.trim()

        // normalize hex-like strings
        if (/^[0-9A-F]+$/i.test(sanitized)) {
          sanitized = sanitized.toLowerCase()
        }

        payload.tro[key] = sanitized
      }
    }
  }

  return payload
}

export async function sanitizeBulkPayloadsRequestBody(req, limitBytes = 1_000_000) { // 1 MB limit
  let body = '';
  let bytesRead = 0;

  for await (const chunk of req) {
    bytesRead += chunk.length;
    if (bytesRead > limitBytes) {
      const err = new Error('Request body too large');
      err.statusCode = 413;
      throw err;
    }
    body += chunk;
  }

  if (body === ''){
    return null;
  }

  // Clean up invisible characters
  const cleanBody = body
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .replace(/\0/g, '')
    .trim();

  return JSON.parse(cleanBody);
}
