/**
 * true only in the lab's own offline program (the Windows .exe), never on the cloud site.
 * Decided at build time (vite `define`), so it works on the client with no request.
 */
declare const __HUB_BUILD__: boolean | undefined;

export const IS_HUB_BUILD: boolean = typeof __HUB_BUILD__ !== "undefined" && __HUB_BUILD__ === true;
