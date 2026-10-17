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

/**
 * Hand-signed `OFF-` keys (`npm run license -- issue`) can never be revoked or released remotely. false = a NEW
 * activation with one is refused, so the only way to activate is a key issued from the admin page, which is tied
 * to a license in the database (revocable, releasable). Programs already activated with an OFF- key keep working.
 * Set true only if you deliberately want irrevocable keys.
 */
export const LICENSE_ALLOW_MANUAL_KEYS: boolean = false;
