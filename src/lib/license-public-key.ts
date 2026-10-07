/**
 * The PUBLIC half of your activation key (safe to ship; it can only check codes, never make them).
 *
 * Empty = activation is NOT required (what you get out of the box, and what the cloud deployment uses).
 * Run `npm run license -- keygen` once on your own computer: it writes your private key outside this folder
 * and fills this line in. Then build the local program (`npm run hub:build`) and give customers that build.
 */
export const LICENSE_PUBLIC_KEY = "";
