import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          // Opt out of in-flight HTML rewriting by intermediaries.
          //
          // Cloudflare injects an analytics beacon into this app's documents.
          // Applying that to a *streamed* SSR response means its parser has to
          // work across chunk boundaries, and a boundary landing mid-token
          // leaves a fragment behind — surfacing as a lone "$" at the foot of
          // every page, the leading character of the $RC/$RS/$RX Suspense
          // scripts React emits while streaming.
          //
          // `no-transform` is the standard directive telling any cache or proxy
          // in the path to deliver the payload unmodified. The real concern is
          // not the stray glyph: the same mis-parse a few bytes earlier would
          // truncate the React Router hydration payload that sits in the same
          // region of the document and break hydration intermittently.
          //
          // Appended rather than assigned, and only once, so a Cache-Control set
          // elsewhere survives.
          const cacheControl = responseHeaders.get("Cache-Control");
          if (!cacheControl) {
            responseHeaders.set("Cache-Control", "no-transform");
          } else if (!/(?:^|,)\s*no-transform\s*(?:,|$)/i.test(cacheControl)) {
            responseHeaders.set("Cache-Control", `${cacheControl}, no-transform`);
          }
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
