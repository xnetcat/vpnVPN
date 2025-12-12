# Platforma SaaS do zarządzania infrastrukturą VPN

## vpnVPN – Projekt i Implementacja

---

# Slajd 1: Wprowadzenie

## Temat pracy

**Projekt i implementacja platformy SaaS do zarządzania infrastrukturą VPN z naciskiem na prywatność użytkowników**

### Cel pracy

- Zaprojektowanie i realizacja kompletnego systemu VPN typu SaaS
- Centralne zarządzanie flotą serwerów VPN
- Ochrona prywatności użytkowników (brak logowania ruchu)

### Motywacja

- Rosnące znaczenie prywatności w sieci
- Popularność usług VPN i modeli subskrypcyjnych
- Potrzeba rozwiązań typu „privacy-first"

---

# Slajd 2: Architektura systemu

## 4 główne komponenty

```
┌─────────────┐     ┌───────────────────┐     ┌─────────────────┐
│   Frontend  │────▶│   Control Plane   │◀────│   VPN Server    │
│  (Next.js)  │     │ (Lambda+Postgres) │     │     (Rust)      │
└─────────────┘     └───────────────────┘     └─────────────────┘
       ▲                                              ▲
       │                                              │
       ▼                                              │
┌─────────────────────────────────────────────────────┘
│   Desktop Client (Tauri + Daemon)
└─────────────────────────────────────────────────────
```

| Komponent          | Rola                                  |
| ------------------ | ------------------------------------- |
| **Frontend**       | Panel użytkownika i administratora    |
| **Control Plane**  | API, zarządzanie stanem, autentykacja |
| **VPN Server**     | Zestawianie tuneli VPN                |
| **Desktop Client** | Aplikacja kliencka z daemonem         |

---

# Slajd 3: Wykorzystane technologie

## Frontend (apps/web)

- **Next.js 15** – App Router, SSR/ISR
- **TypeScript** – typowanie statyczne
- **Prisma + PostgreSQL** – ORM i baza danych
- **NextAuth.js** – autoryzacja (GitHub/Google/email)
- **Stripe** – subskrypcje i płatności
- **Wdrożenie:** Vercel

## Control Plane (services/control-plane)

- **Bun + Fastify** – szybki runtime i framework HTTP
- **AWS Lambda** – serverless z obrazami Docker
- **PostgreSQL/Neon** – managed baza danych
- **Pulumi** – Infrastructure as Code (TypeScript)

---

# Slajd 4: Wykorzystane technologie (cd.)

## VPN Server (apps/vpn-server)

- **Rust** – bezpieczeństwo pamięci, wysoka wydajność
- **WireGuard** – nowoczesny protokół VPN
- **OpenVPN** – dojrzały protokół z szerokim wsparciem
- **IKEv2/IPsec** – protokół enterprise
- **Tokio + Axum** – asynchroniczne HTTP/API
- **Wdrożenie:** EC2 z Elastic IP

## Desktop Client (apps/desktop)

- **Tauri** – lekki framework aplikacji desktopowych
- **React + Vite** – szybki frontend
- **Daemon Rust** – uprzywilejowany proces VPN
- **IPC (Unix Socket)** – komunikacja GUI ↔ Daemon

---

# Slajd 5: Co zostało zrealizowane

## ✅ Frontend (95%)

- Pełny SaaS z rejestracją i autoryzacją
- Integracja ze Stripe (subskrypcje, webhooki)
- Panel użytkownika: urządzenia, konfiguracje VPN
- Panel administratora: serwery, tokeny, użytkownicy

## ✅ Control Plane (100%)

- Wszystkie endpointy API (`/server/register`, `/peers`, `/tokens`, ...)
- Autentykacja (Bearer token + API key)
- Wdrożenie na AWS Lambda

## ✅ VPN Server (90%)

- Rejestracja i synchronizacja peerów
- WireGuard, OpenVPN, IKEv2 backends
- Metryki i admin API
- Wdrożenie na EC2 w 10 regionach

---

# Slajd 6: Co zostało zrealizowane (cd.)

## ✅ Desktop Client (85%)

- Architektura Tauri + Daemon
- Obsługa WireGuard, OpenVPN, IKEv2
- IPC przez Unix socket
- Buildy na macOS, Linux, Windows

## ✅ Infrastruktura (Pulumi)

- Lambda z obrazami Docker (ECR)
- API Gateway + PostgreSQL/Neon
- EC2 z Elastic IP dla węzłów VPN
- S3 dla buildów desktop

## ✅ Dokumentacja

- Architektura systemu
- API Reference (wszystkie endpointy)
- Przewodnik konfiguracji
- DEVELOPMENT.md dla developera

---

# Slajd 7: Czego się nauczyłem

## Technologie sieciowe

- Protokoły VPN (WireGuard vs OpenVPN vs IKEv2)
- Interfejsy TUN/TAP, routowanie, NAT
- Konfiguracja iptables i masquerade

## Architektura chmurowa

- AWS Lambda z Docker (ECR)
- Infrastructure as Code (Pulumi)
- Serverless patterns

## Programowanie systemowe

- Rust – bezpieczeństwo pamięci
- IPC i komunikacja międzyprocesowa
- Uprzywilejowane operacje sieciowe

## Bezpieczeństwo i prywatność

- Minimalizacja metadanych
- Brak logowania ruchu użytkowników
- Zarządzanie tokenami i sekretami

---

# Slajd 8: Co pozostało do implementacji

## ✅ Zrealizowane (produkcja)

- [x] Konfiguracja webhooków Stripe
- [x] Weryfikacja domeny email (Resend)
- [x] Certyfikaty SSL dla custom domains
- [x] Wdrożenie na 10 regionów AWS

## 🔲 Testowanie

- [ ] Test end-to-end na produkcji (rejestracja → płatność → połączenie VPN)

## 🔲 Nowe funkcjonalności

- [ ] Wsparcie proxy (SOCKS5/HTTP)
- [ ] Wdrażanie węzłów VPN z panelu administratora

## 🔲 Dokumentacja pracy dyplomowej

- [ ] Część teoretyczna (protokoły VPN, SaaS)
- [ ] Analiza wymagań i projekt systemu
- [ ] Opis implementacji
- [ ] Testy i wnioski

---

# Slajd 9: Podsumowanie

## Zrealizowano

| Obszar                  | Status  |
| ----------------------- | ------- |
| Frontend SaaS           | ✅ 95%  |
| Control Plane           | ✅ 100% |
| VPN Server              | ✅ 90%  |
| Desktop Client          | ✅ 85%  |
| Infrastruktura          | ✅ 100% |
| Dokumentacja techniczna | ✅ 100% |

## Kluczowe osiągnięcia

- Kompletny system VPN typu SaaS
- 4 protokoły VPN (WireGuard, OpenVPN, IKEv2)
- 3 platformy desktopowe (macOS, Linux, Windows)
- 10 regionów AWS
- Privacy-first design

---

# Slajd 10: Dziękuję za uwagę

## Pytania?

**Repozytorium:** vpnVPN (monorepo)

**Stos technologiczny:**

- Frontend: Next.js, TypeScript, Prisma, Stripe
- Backend: Bun, Fastify, AWS Lambda, PostgreSQL
- VPN: Rust, WireGuard, OpenVPN, IKEv2
- Desktop: Tauri, React, Rust Daemon
- Infra: Pulumi, AWS, Docker, ECR

---

_Prezentacja wygenerowana na podstawie dokumentacji projektu vpnVPN_
