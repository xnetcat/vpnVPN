# Platforma SaaS do zarządzania infrastrukturą VPN

## projekt – Projekt i Implementacja

---

# Slajd 1: Wprowadzenie

## Temat pracy

**Projekt i implementacja platformy SaaS do zarządzania infrastrukturą VPN**

### Cel pracy

- Zaprojektowanie i realizacja kompletnego systemu VPN typu SaaS
- Centralne zarządzanie flotą serwerów VPN rozproszonych geograficznie
- Ochrona prywatności użytkowników (brak logowania ruchu, minimalizacja metadanych)
- Wsparcie wielu protokołów VPN (WireGuard, OpenVPN, IKEv2)

### Motywacja

- Rosnące znaczenie prywatności w sieci (RODO, inwigilacja, blokady geograficzne)
- Popularność usług VPN i modeli subskrypcyjnych (rynek VPN: $45 mld do 2027)
- Potrzeba rozwiązań typu „privacy-first" z weryfikowalnym przepływem danych
- Brak otwartych, kompletnych implementacji SaaS VPN

---

# Slajd 2: Architektura systemu

## 4 główne komponenty

```
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│   Control Plane   │◀────│   VPN Server    │
│   (Next.js)     │     │ (Lambda+Postgres) │     │     (Rust)      │
│   Vercel        │     │   AWS Serverless  │     │   EC2 + EIP     │
└─────────────────┘     └───────────────────┘     └─────────────────┘
        ▲                        ▲                        ▲
        │ HTTPS                  │ HTTPS                  │ UDP/TCP
        ▼                        │                        ▼
┌─────────────────┐              │              ┌─────────────────┐
│  Desktop Client │──────────────┘              │   Użytkownicy   │
│  (Tauri+Daemon) │                             │   końcowi       │
└─────────────────┘                             └─────────────────┘
```

| Komponent          | Technologia        | Rola                                       |
| ------------------ | ------------------ | ------------------------------------------ |
| **Frontend**       | Next.js 15, Vercel | Panel użytkownika, admin, płatności Stripe |
| **Control Plane**  | Lambda, PostgreSQL | API REST, zarządzanie stanem, autentykacja |
| **VPN Server**     | Rust, EC2          | Tunele VPN, synchronizacja peerów          |
| **Desktop Client** | Tauri, Rust Daemon | Aplikacja kliencka, połączenia VPN         |

---

# Slajd 3: Wykorzystane technologie

## Frontend (apps/web)

- **Next.js 15** – App Router, Server Components, SSR/ISR, SEO-friendly
- **TypeScript** – typowanie statyczne, lepsza jakość kodu
- **Prisma + PostgreSQL** – ORM z type-safe queries, migracje
- **NextAuth.js** – autoryzacja OAuth (GitHub, Google) + magic link email
- **Stripe** – subskrypcje, Checkout, Customer Portal, webhooki
- **tRPC** – type-safe API między frontendem a backendem
- **Wdrożenie:** Vercel (edge functions, CDN, automatyczne HTTPS)

## Control Plane (services/control-plane)

- **Bun** – szybszy runtime niż Node.js (3x startup, natywny TS)
- **Fastify** – wydajny framework HTTP (~77k req/s)
- **AWS Lambda** – serverless, płatność za użycie, auto-skalowanie
- **Docker on Lambda** – obrazy ECR, pełna kontrola środowiska
- **PostgreSQL/Neon** – managed serverless Postgres, branching
- **Pulumi** – Infrastructure as Code w TypeScript

---

# Slajd 4: Wykorzystane technologie (cd.)

## VPN Server (apps/vpn-server)

- **Rust** – bezpieczeństwo pamięci (brak null, brak data races), wydajność C/C++
- **WireGuard** – nowoczesny protokół, ~4000 linii kodu, ChaCha20-Poly1305
- **OpenVPN** – dojrzały protokół (20+ lat), TLS, szeroka kompatybilność
- **IKEv2/IPsec** – natywne wsparcie w Windows/macOS/iOS/Android, MOBIKE
- **Tokio** – asynchroniczny runtime (epoll/kqueue), zero-cost abstractions
- **Axum** – framework HTTP zbudowany na Tower, middleware, routing
- **Wdrożenie:** EC2 z Elastic IP (stałe adresy publiczne), 10 regionów

## Desktop Client (apps/desktop)

- **Tauri** – lekki (5MB vs 150MB Electron), natywny webview, Rust backend
- **React + Vite** – szybki HMR, ESM, optymalizacja produkcyjna
- **Daemon Rust** – uprzywilejowany proces z prawami root/admin
- **IPC (Unix Socket/Named Pipe)** – komunikacja GUI ↔ Daemon, JSON-RPC
- **Platformy:** macOS (x64/ARM), Linux (deb/rpm/AppImage), Windows (MSI/NSIS)

---

# Slajd 5: Co zostało zrealizowane

## ✅ Frontend (95%)

- Pełny SaaS z rejestracją, logowaniem (OAuth + email magic link)
- Integracja ze Stripe: 3 plany (Basic, Pro, Enterprise), webhooki, portal
- Panel użytkownika: zarządzanie urządzeniami, generowanie konfiguracji VPN/QR
- Panel administratora: zarządzanie serwerami, tokenami, użytkownikami
- Dashboard z metrykami w czasie rzeczywistym (połączenia, transfer, regiony)

## ✅ Control Plane (100%)

- Kompletne API: `/server/register`, `/server/peers`, `/peers`, `/tokens`, `/servers`
- Autentykacja: Bearer token dla węzłów VPN, API key dla web app
- Rate limiting: per-IP i per-token, ochrona przed nadużyciami
- Wdrożenie: AWS Lambda z Docker, API Gateway, auto-deploy via GitHub Actions

## ✅ VPN Server (90%)

- Rejestracja w control plane, cykliczna synchronizacja peerów (30s)
- Trzy backendy: WireGuard (wg-quick), OpenVPN (server mode), IKEv2 (strongSwan)
- Admin API: `/health`, `/metrics`, `/status`, `/pubkey`
- Metryki: aktywne sesje, transfer, czas działania (Prometheus format)

---

# Slajd 6: Co zostało zrealizowane (cd.)

## ✅ Desktop Client (85%)

- Architektura z separacją uprawnień: GUI (nieprzywil.) + Daemon (root)
- Obsługa trzech protokołów VPN z automatycznym wyborem najlepszego serwera
- IPC przez Unix socket (prod: /var/run/, dev: /tmp/)
- Buildy automatyczne: macOS DMG, Linux deb/rpm/AppImage, Windows MSI

## ✅ Infrastruktura (Pulumi 100%)

- **Global stack:** Lambda (control-plane, metrics), ECR, S3, API Gateway
- **Regional stacks:** EC2 z Elastic IP, VPC, Security Groups
- 10 regionów AWS: us-east-1, us-west-2, eu-west-1, eu-central-1, ap-northeast-1...
- Observability: Amazon Managed Prometheus, Grafana dashboards

## ✅ CI/CD (GitHub Actions)

- Pipeline: lint → test → build → deploy (staging/production)
- Rust: cross-compile do x86_64, push do ECR
- Desktop: matrix build (macOS/Linux/Windows), upload do S3
- Pulumi: preview na PR, deploy na merge do main

---

# Slajd 7: Czego się nauczyłem

## Technologie sieciowe i VPN

- Protokoły VPN: WireGuard (Noise Protocol), OpenVPN (TLS), IKEv2 (Diffie-Hellman)
- Warstwa sieciowa: interfejsy TUN/TAP, routowanie, NAT/masquerade
- Konfiguracja systemu: iptables, sysctl (ip_forward, rp_filter)
- Porty i protokoły: WireGuard UDP 51820, OpenVPN UDP 1194, IKEv2 UDP 500/4500

## Architektura chmurowa (AWS)

- Serverless: Lambda cold starts, Docker vs ZIP, API Gateway integracja
- Infrastructure as Code: Pulumi (TypeScript), state management, dependencies
- Networking: VPC, subnets, security groups, Elastic IP allocation

## Programowanie systemowe (Rust)

- Ownership i borrowing – eliminacja błędów pamięci w compile-time
- Async/await z Tokio – wydajna obsługa tysięcy połączeń
- IPC i komunikacja międzyprocesowa – Unix sockets, privileged operations
- Cross-platform: conditional compilation (#[cfg]), platform-specific code

## Bezpieczeństwo i prywatność

- Brak logowania ruchu – tylko metryki zagregowane (bez IP użytkowników)
- Zarządzanie sekretami – Pulumi encrypted state, environment variables
- Autentykacja – bearer tokens (VPN nodes), API keys (web app), OAuth (users)

---

# Slajd 8: Co pozostało do implementacji

## ✅ Zrealizowane (produkcja)

- [x] Stripe webhooks i Customer Portal (produkcja)
- [x] Domena email z weryfikacją SPF/DKIM (Resend)
- [x] Certyfikaty SSL dla custom domains (ACM + CloudFront)
- [x] Wdrożenie VPN na 10 regionów AWS z Elastic IP

## 🔲 Testowanie

- [ ] Test end-to-end na produkcji: signup → payment → device → VPN connection
- [ ] Testy obciążeniowe: symulacja 1000+ jednoczesnych połączeń

## 🔲 Nowe funkcjonalności

- [ ] Wsparcie proxy (SOCKS5/HTTP) – obejście blokad DPI
- [ ] Wdrażanie węzłów VPN z panelu administratora (integracja z Pulumi)
- [ ] Split tunneling – wybór aplikacji korzystających z VPN

## 🔲 Dokumentacja pracy dyplomowej

- [ ] Część teoretyczna: protokoły VPN, architektura SaaS, bezpieczeństwo
- [ ] Analiza wymagań funkcjonalnych i niefunkcjonalnych
- [ ] Opis implementacji z diagramami sekwencji
- [ ] Testy, wnioski i kierunki dalszego rozwoju

---

# Slajd 9: Podsumowanie

## Status realizacji

| Obszar                  | Status  | Uwagi                                  |
| ----------------------- | ------- | -------------------------------------- |
| Frontend SaaS           | ✅ 95%  | Stripe, OAuth, dashboard, admin        |
| Control Plane           | ✅ 100% | Wszystkie endpointy, Lambda, Postgres  |
| VPN Server              | ✅ 90%  | WireGuard, OpenVPN, IKEv2, 10 regionów |
| Desktop Client          | ✅ 85%  | macOS, Linux, Windows, daemon          |
| Infrastruktura          | ✅ 100% | Pulumi, CI/CD, multi-region            |
| Dokumentacja techniczna | ✅ 100% | API, architektura, runbooki            |

## Kluczowe osiągnięcia

- **Kompletny system VPN** – od rejestracji użytkownika do połączenia VPN
- **3 protokoły VPN** – WireGuard (szybki), OpenVPN (kompatybilny), IKEv2 (natywny)
- **3 platformy desktop** – macOS, Linux, Windows z natywnym instalatorem
- **10 regionów AWS** – globalna obecność, niskie opóźnienia
- **Privacy-first** – brak logowania ruchu, minimalizacja metadanych

---

# Slajd 10: Dziękuję za uwagę

## Pytania?

### Stos technologiczny

| Warstwa        | Technologie                                  |
| -------------- | -------------------------------------------- |
| **Frontend**   | Next.js 15, TypeScript, Prisma, Stripe, tRPC |
| **Backend**    | Bun, Fastify, AWS Lambda, PostgreSQL/Neon    |
| **VPN Server** | Rust, Tokio, Axum, WireGuard, OpenVPN, IKEv2 |
| **Desktop**    | Tauri, React, Vite, Rust Daemon              |
| **Infra**      | Pulumi, AWS (Lambda, EC2, ECR, S3), Docker   |
| **CI/CD**      | GitHub Actions, cross-platform builds        |
