import { registerPlugin, WebPlugin } from "@capacitor/core";

class PartiquleAppleSignInWeb extends WebPlugin {
  async authorize() {
    throw this.unavailable("Sign in with Apple is available in the iOS app.");
  }
}

export const PartiquleAppleSignIn = registerPlugin("PartiquleAppleSignIn", {
  web: () => new PartiquleAppleSignInWeb(),
});
