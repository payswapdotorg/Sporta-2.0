/**
 * w6c-1: stdlib RFC 6455 test client — client-side masking REQUIRED (§5.1), accept hash verified,
 * the server's close frame reported separately from the client's own (SPEC §W6C-1).
 * Accepts single-frame server messages only (the w6c server sends single-frame text; fragmented
 * server input surfaces as a loud close rather than a silent mis-read).
 *
 * w7c-3 file split (file-size law): the implementation lives in
 * `wsClientImpl.ts` (types + impl class) and `wsConnect.ts` (the connection
 * builder, with the additive auth options). This file remains the
 * HISTORICAL PUBLIC PATH, re-exporting the identical names, so every
 * existing import (`.../wsSharedDeltaSink/wsClient.js`, including the
 * frozen contract re-export and the w6c tests) keeps working unchanged.
 * The import graph is acyclic: wsClient.ts -> wsConnect.ts -> wsClientImpl.ts.
 */
export { connectWs } from './wsConnect.js';
export type { ConnectWsOptions } from './wsConnect.js';
export { WsTestClientImpl } from './wsClientImpl.js';
export type { WsTestClient, WsCloseInfo } from './wsClientImpl.js';
