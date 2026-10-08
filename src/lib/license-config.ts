/**
 * Activation settings baked into the program you give customers.
 *
 *  - LICENSE_PUBLIC_KEY: written by `npm run license -- keygen`. Empty = activation NOT required (the default).
 *  - LICENSE_SERVER_URL: your cloud deployment that approves activations (e.g. "https://your-app.vercel.app").
 *
 * The deployment that holds LICENSE_PRIVATE_KEY is the license server itself and never asks for activation.
 */
export const LICENSE_PUBLIC_KEY: string = "";
export const LICENSE_SERVER_URL: string = "";
