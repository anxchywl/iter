import { NextRequest } from "next/server";

export function clientAddressHeader(request: NextRequest): Record<string, string> {
  const address = request.headers.get("x-iter-client-ip")?.trim();
  if (!address || address.length > 64 || !/^[0-9a-f.:]+$/i.test(address)) {
    return {};
  }
  return { "X-Iter-Client-IP": address };
}
