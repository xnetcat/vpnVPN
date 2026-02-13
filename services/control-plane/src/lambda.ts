import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { buildServer } from "./server";

/**
 * Lambda handler for the control-plane service.
 * Uses Fastify's inject method to handle requests without starting an HTTP server.
 * This allows the same code to run on Lambda or as a standalone server.
 */
export async function handler(
  event: APIGatewayProxyEventV2,
  _context: Context,
): Promise<APIGatewayProxyResultV2> {
  const fastify = await buildServer();

  // Convert API Gateway event to Fastify inject format
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  const queryString = event.rawQueryString || "";
  const url = queryString ? `${path}?${queryString}` : path;

  // Build headers object (API Gateway v2 uses lowercase headers)
  const headers: Record<string, string> = {};
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value) {
        headers[key.toLowerCase()] = value;
      }
    }
  }

  // Handle body
  let payload: string | undefined;
  if (event.body) {
    payload = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body;
  }

  // Use Fastify's inject method to handle the request
  const response = await fastify.inject({
    method: method as
      | "GET"
      | "POST"
      | "PUT"
      | "DELETE"
      | "PATCH"
      | "HEAD"
      | "OPTIONS",
    url,
    headers,
    payload,
  });

  // Convert response headers to API Gateway format
  const responseHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(response.headers)) {
    if (typeof value === "string") {
      responseHeaders[key] = value;
    } else if (Array.isArray(value)) {
      responseHeaders[key] = value.join(", ");
    }
  }

  return {
    statusCode: response.statusCode,
    headers: responseHeaders,
    body: response.body,
  };
}

export default handler;
