import Foundation
import Capacitor

/// Router qui résout un chemin de dossier ("/menage/", "/airbnb/adresse/") vers
/// son "index.html", au lieu du fallback SPA par défaut de Capacitor (qui renvoie
/// l'index.html RACINE, c.-à-d. la home, et casse donc toute la navigation
/// multi-pages d'Astro dans l'app native).
///
/// C'est l'équivalent iOS de `public/native-router-sw.js` utilisé sur Android :
/// sur iOS, les service workers ne fonctionnent pas sous le scheme `capacitor://`,
/// il faut donc résoudre la route côté natif.
public struct BovoRouter: Router {
    public init() {}
    public var basePath: String = ""

    public func route(for path: String) -> String {
        let pathUrl = URL(fileURLWithPath: path)

        // Chemin avec extension (assets JS/CSS/img, *.html explicites) : tel quel.
        if !pathUrl.pathExtension.isEmpty {
            return basePath + path
        }

        // Racine ou vide : home.
        if path.isEmpty || path == "/" {
            return basePath + "/index.html"
        }

        // Chemin de dossier : tenter "<dossier>/index.html".
        var trimmed = path
        if trimmed.hasSuffix("/") {
            trimmed = String(trimmed.dropLast())
        }
        let candidate = basePath + trimmed + "/index.html"
        if FileManager.default.fileExists(atPath: candidate) {
            return candidate
        }

        // Fallback : comportement SPA d'origine (index.html racine).
        return basePath + "/index.html"
    }
}

/// Sous-classe du view controller Capacitor pour injecter le router ci-dessus.
/// Référencée par Base.lproj/Main.storyboard (customClass + customModule="App").
@objc(BovoBridgeViewController)
public class BovoBridgeViewController: CAPBridgeViewController {
    open override func router() -> Router {
        return BovoRouter()
    }
}
