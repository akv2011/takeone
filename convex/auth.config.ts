declare const process: { env: Record<string, string | undefined> };
// Firebase ID tokens use issuer https://securetoken.google.com/<projectId> and audience <projectId>; Convex discovers the signing keys from the issuer's openid-configuration.
export default {
  providers: [
    { domain: `https://securetoken.google.com/${process.env.FIREBASE_PROJECT_ID}`, applicationID: process.env.FIREBASE_PROJECT_ID },
  ],
};
