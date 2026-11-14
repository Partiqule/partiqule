import AuthenticationServices
import Capacitor
import UIKit

@objc(PartiquleAppleSignInPlugin)
public class PartiquleAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "PartiquleAppleSignInPlugin"
    public let jsName = "PartiquleAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        if pendingCall != nil {
            call.reject("Apple sign-in is already in progress.")
            return
        }
        pendingCall = call
        DispatchQueue.main.async {
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = scene.windows.first {
            return window
        }
        return ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            pendingCall?.reject("Apple did not return an ID credential.")
            pendingCall = nil
            return
        }
        guard let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8),
              !idToken.isEmpty else {
            pendingCall?.reject("Apple did not return a sign-in token.")
            pendingCall = nil
            return
        }
        pendingCall?.resolve([
            "idToken": idToken,
            "user": credential.user,
            "email": credential.email ?? "",
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? ""
        ])
        pendingCall = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let nsError = error as NSError
        if nsError.domain == ASAuthorizationError.errorDomain && nsError.code == ASAuthorizationError.canceled.rawValue {
            pendingCall?.reject("The user canceled the authorization attempt.", "canceled")
        } else {
            pendingCall?.reject(error.localizedDescription)
        }
        pendingCall = nil
    }
}
