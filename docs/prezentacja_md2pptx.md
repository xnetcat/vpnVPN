template: Martin Template.pptx

# Platforma SaaS do zarządzania infrastrukturą VPN

Projekt i Implementacja platformy SaaS do zarządzania infrastrukturą VPN z naciskiem na prywatność użytkowników

## Wprowadzenie

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

## Architektura

### Architektura systemu

- Frontend (Next.js) - Panel użytkownika, admin, płatności Stripe
- Control Plane (Lambda, PostgreSQL) - API REST, zarządzanie stanem, autentykacja
- VPN Server (Rust, EC2) - Tunele VPN, synchronizacja peerów
- Desktop Client (Tauri, Rust Daemon) - Aplikacja kliencka, połączenia VPN

### Wykorzystane technologie - Frontend & Control Plane

- **Frontend:** Next.js 15, TypeScript, Prisma, NextAuth.js, Stripe, tRPC
- **Control Plane:** Bun, Fastify, AWS Lambda, Docker, PostgreSQL/Neon, Pulumi

### Wykorzystane technologie - VPN Server & Desktop

- **VPN Server:** Rust, WireGuard, OpenVPN, IKEv2, Tokio, Axum
- **Desktop Client:** Tauri, React, Vite, Daemon Rust, IPC (Unix Socket)

## Realizacja

### Co zostało zrealizowane - Frontend & Control Plane

- **Frontend (95%):** Rejestracja, Stripe, Panel użytkownika/admina, Dashboard
- **Control Plane (100%):** Pełne API, Autentykacja Bearer/API Key, Rate limiting, AWS Deploy

### Co zostało zrealizowane - VPN & Infrastruktura

- **VPN Server (90%):** WireGuard/OpenVPN/IKEv2, Sync co 30s, Metrics API
- **Infrastruktura (100%):** Pulumi Global/Regional stacks, 10 regionów AWS, CI/CD

## Podsumowanie

### Czego się nauczyłem

- Technologie sieciowe: WireGuard, OpenVPN, IKEv2, TUN/TAP, iptables
- Architektura chmurowa: AWS Serverless, Pulumi, Networking
- Programowanie systemowe: Rust (Ownership, Async, IPC)
- Bezpieczeństwo: Brak logowania ruchu, Zarządzanie sekretami

### Co pozostało do implementacji

- Testy E2E na produkcji i testy obciążeniowe
- Wsparcie proxy (SOCKS5/HTTP)
- Wdrażanie węzłów VPN z panelu administratora
- Pełna dokumentacja pracy dyplomowej

### Podsumowanie statusu

- **Frontend SaaS:** ✅ 95%
- **Control Plane:** ✅ 100%
- **VPN Server:** ✅ 90%
- **Desktop Client:** ✅ 85%
- **Infrastruktura:** ✅ 100%
- **Dokumentacja:** ✅ 100%

# Dziękuję za uwagę

Pytania?


