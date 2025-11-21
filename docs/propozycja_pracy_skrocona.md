## Propozycja tematu pracy dyplomowej

**Proponowany temat:**  
**Projekt i implementacja platformy SaaS do zarządzania infrastrukturą VPN z naciskiem na prywatność użytkowników (na przykładzie systemu vpnVPN).**

### Krótki opis pracy

W pracy planowane jest zaprojektowanie oraz częściowa/pełna implementacja systemu vpnVPN – platformy typu SaaS, która umożliwia:

- użytkownikom końcowym: zakup subskrypcji, zarządzanie urządzeniami i pobieranie konfiguracji VPN,
- operatorowi: zarządzanie flotą węzłów VPN uruchamianych na różnych środowiskach (AWS EC2, VPS, serwery bare‑metal) oraz kontrolę nad dostępem użytkowników.

Rozwiązanie składa się z trzech potwierdzonych w dokumentacji komponentów:

- **Frontend `web-app`** – aplikacja Next.js (App Router, TypeScript, Tailwind CSS) wdrożona na Vercel, z logowaniem (Auth.js/NextAuth, GitHub/Google/email), integracją ze Stripe (subskrypcje, portal, webhooki) oraz panelami: użytkownika (`/dashboard`) i administratora (`/admin`).
- **Control Plane (AWS)** – warstwa sterująca zbudowana na AWS API Gateway, kontenerowych funkcjach Lambda (Node.js 20) i DynamoDB (`vpnServers`, `vpnPeers`, `vpnTokens`, `proxies`), definiowana jako kod przy użyciu Pulumi (TypeScript).
- **Agent `vpn-server` (Rust)** – wieloplatformowy agent w Rust zarządzający WireGuard, OpenVPN i IKEv2/IPsec na hostach (Linux/macOS/Windows), który rejestruje się w Control Plane, cyklicznie synchronizuje listę peerów oraz wysyła zanonimizowane metryki (bez logowania ruchu i IP użytkowników).

W pracy zostaną opisane zastosowane technologie sieciowe (protokoły VPN, TUN/TAP, routowanie, NAT), architektura systemu (przepływ danych od przeglądarki do węzła VPN) oraz decyzje projektowe związane z prywatnością i bezpieczeństwem (minimalizacja metadanych, szyfrowanie, brak mocków w kluczowych ścieżkach testowych).

### Jakie informacje już posiadamy

Na podstawie istniejącej dokumentacji i kodu projektu vpnVPN dostępne są już następujące, zweryfikowane zasoby:

- **Specyfikacja systemu (`docs/PROJECT_SPEC.md`)** – opis głównych filarów (privacy‑first, uniwersalne wdrożenie, pełny frontend SaaS, weryfikowalny przepływ danych), szczegółowa architektura trzech warstw (frontend `web-app`, Control Plane na AWS, agent `vpn-server` w Rust), model danych (użytkownicy, subskrypcje, urządzenia/peers, serwery, proxy) oraz diagram sekwencji end‑to‑end (od zakupu subskrypcji po zestawienie tunelu WireGuard).
- **Szczegółowy plan zadań (`docs/TODO.md`)** – rozpisany roadmap dla frontendu, Control Plane i agenta VPN (kontrakty API: `POST /server/register`, `POST /server/heartbeat`, `GET /server/peers`, `POST /peers`; kształt CLI `vpn-server run/doctor`; lokalne środowisko oparte o Docker Compose i LocalStack).
- **README poszczególnych komponentów (`README.md`, `web-app/README.md`, `vpn-server/README.md`)** – potwierdzenie stosu technologicznego (Next.js + Auth.js + Stripe, Pulumi na AWS, Rust + WireGuard/OpenVPN/IKEv2), sposobu konfiguracji (Vercel env vars, CLI/agenty, brak `.env` w repo) oraz założeń prywatności (brak logowania ruchu, tylko metryki zagregowane).

Te dokumenty pozwalają w pracy skupić się zarówno na warstwie teoretycznej (VPN, SaaS, architektury chmurowe), jak i na praktycznym opisie oraz analizie konkretnego, rzeczywistego systemu.

### Wstępny plan pracy (skrótowy)

1. **Wstęp**
   - Motywacja wyboru tematu (wzrost popularności VPN i usług subskrypcyjnych, rosnące wymagania dotyczące prywatności).
   - Cel pracy i zakres (opracowanie i analiza platformy vpnVPN).

2. **Podstawy teoretyczne**
   - Przegląd protokołów VPN (WireGuard, OpenVPN, IKEv2/IPsec) oraz podstawowych mechanizmów sieciowych (TUN/TAP, routowanie, NAT, IPv4/IPv6).
   - Krótkie omówienie modelu SaaS i architektur serverless/chmurowych (API Gateway, funkcje Lambda, bazy NoSQL).

3. **Opis architektury i projektu systemu vpnVPN**
   - Podział na trzy główne komponenty: `web-app`, Control Plane na AWS, agent `vpn-server` w Rust.
   - Model danych użytkowników, subskrypcji, urządzeń/peerów i serwerów oraz opis głównych przepływów (rejestracja użytkownika, zakup subskrypcji, dodanie urządzenia, rejestracja węzła VPN, synchronizacja peerów).
   - Założenia dotyczące prywatności i bezpieczeństwa (minimalizacja metadanych, brak logów ruchu, szyfrowanie, kontrola dostępu).

4. **Implementacja wybranych elementów systemu**
   - Frontend: integracja z Auth.js i Stripe, kluczowe widoki dashboardu i panelu admina, generowanie konfiguracji WireGuard po stronie przeglądarki.
   - Control Plane: definicje infrastruktury w Pulumi, implementacja wybranych endpointów (`/server/register`, `/server/peers`, `/peers`).
   - Agent VPN: struktura CLI (`run`, `doctor`), pętla synchronizacji peerów i raportowania metryk, integracja z WireGuard/OpenVPN/IKEv2 (na poziomie zagregowanych danych, bez logowania ruchu).

5. **Testowanie, wnioski i kierunki dalszego rozwoju**
   - Opis lokalnego środowiska end‑to‑end (Docker Compose, LocalStack) i scenariuszy testowych.
   - Ocena stopnia spełnienia założeń (szczególnie w obszarze prywatności i skalowalności).
   - Propozycje rozbudowy (np. dodatkowe funkcje w panelu, kolejne regiony, bardziej zaawansowane polityki routingu, klienci mobilni).


