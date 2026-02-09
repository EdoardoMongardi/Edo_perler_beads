/**
 * Compute SHA-256 of a deviceId. Never store the raw deviceId in Redis.
 */
export async function hashDeviceId(deviceId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(deviceId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}