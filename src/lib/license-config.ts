/**
 * Activation settings baked into the program you give customers.
 *
 *  - LICENSE_PUBLIC_KEY: written by `npm run license -- keygen`. Empty = activation NOT required (the default).
 *  - LICENSE_SERVER_URL: your cloud deployment that approves activations (e.g. "https://your-app.vercel.app").
 *
 * The deployment that holds LICENSE_PRIVATE_KEY is the license server itself and never asks for activation.
 */
export const LICENSE_PUBLIC_KEY: string = "tHZKsK+53XYcoZ9BEjFULKvUWPMUY8Gbf+khyX9A028=";
export const LICENSE_SERVER_URL: string = "https://microscopic.vercel.app";

/**
 * Master switch for activation. false = the program runs open, with no activation code asked for anywhere.
 * It only ever affects the lab's own program (HUB_MODE=1): the cloud deployment is never locked by it.
 * The public key and server URL above are kept as they are, so turning enforcement back on later is just
 * changing this to true (no new keys, and codes already issued keep working).
 */
export const LICENSE_ENFORCED: boolean = true;
