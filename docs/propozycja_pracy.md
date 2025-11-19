## Propozycja tematu pracy dyplomowej

**Proponowany temat:**  
**Projekt i implementacja platformy SaaS do zarządzania infrastrukturą VPN z zachowaniem wysokich standardów prywatności (na przykładzie systemu vpnVPN).**

### Krótki opis planowanej pracy

W pracy planowane jest zaprojektowanie i realizacja kompletnej platformy typu SaaS, umożliwiającej sprzedaż dostępu do prywatnej sieci VPN oraz centralne zarządzanie flotą serwerów VPN uruchamianych na zróżnicowanej infrastrukturze (chmura publiczna, VPS, serwery bare‑metal).

Platforma będzie składała się z trzech głównych komponentów:

- **Frontend (warstwa SaaS)** – aplikacja webowa w oparciu o Next.js, odpowiedzialna za rejestrację i logowanie użytkowników, obsługę płatności abonamentowych (Stripe), panel użytkownika (zarządzanie urządzeniami/VPN) oraz panel administracyjny (zarządzanie flotą serwerów, użytkownikami i przychodami).
- **Control Plane (backend)** – serwerlessowa warstwa sterująca (AWS API Gateway + Lambda + DynamoDB), która przechowuje stan systemu (użytkownicy, urządzenia/peers, serwery VPN), udostępnia API do rejestracji węzłów, synchronizacji konfiguracji oraz obsługi webhooków płatności.
- **VPN Server (data plane)** – autonomiczny agent napisany w Rust, uruchamiany jako kontener Docker lub binarka, odpowiedzialny za zestawianie tuneli VPN (WireGuard / OpenVPN / IKEv2), cykliczną synchronizację listy dozwolonych peerów z Control Plane oraz raportowanie zanonimizowanych metryk.

Szczególny nacisk zostanie położony na **prywatność użytkowników** (brak logowania ruchu, minimalizacja przechowywanych metadanych), **bezpieczeństwo komunikacji** (nowoczesne algorytmy kryptograficzne, poprawna konfiguracja protokołów VPN) oraz **przejrzystą architekturę** umożliwiającą niezależną weryfikację przepływu danych.

### Jakie informacje/zasoby już posiadamy

Na potrzeby realizacji pracy dostępna jest już istotna część analizy i projektu systemu vpnVPN:

- **Specyfikacja wysokopoziomowa systemu** – opis kluczowych filarów rozwiązania (prywatność, uniwersalne wdrożenie, UX, transparentność), ogólny opis architektury (frontend na Vercel, Control Plane na AWS, Rustowy serwer VPN) oraz sekwencyjne diagramy przepływu danych (m.in. proces zakupu subskrypcji, provisioning peerów, rejestracja węzłów VPN, raportowanie metryk).
- **Szczegółowa tablica zadań i roadmapa** – plany rozwoju frontendu (autoryzacja z NextAuth, integracja ze Stripe, dashboard użytkownika i panel admina), backendu (kontrakty API `/server/register`, `/server/peers`, `/peers`, `/server/heartbeat`) oraz serwera VPN (logika CLI, pętla synchronizacji peerów, zbieranie metryk, audyt logów pod kątem prywatności).
- **Dokumentacja podprojektów**:
  - Frontend: opis wykorzystania Next.js (App Router, TypeScript, TailwindCSS), Prisma + Postgres, Auth.js/NextAuth, Stripe Checkout/Portal, konfiguracja środowiska i wdrożenia na Vercel.
  - VPN Server: opis gotowych endpointów administracyjnych (`/health`, `/metrics`), sposobu nasłuchiwania na portach VPN, konfiguracji przez zmienne środowiskowe oraz integracji z metrykami (CloudWatch).
  - Infra/Pulumi: zarys infrastruktury jako kodu (Pulumi TS), wykorzystanie AWS (DynamoDB, API Gateway, Auto Scaling Group dla węzłów).
- **Wstępny model danych** – definicje obiektów typu `User`, `Device/Peer`, `Server` i sposób powiązania ich z subskrypcjami oraz konfiguracją sieciową.

Na bazie powyższych materiałów możliwe jest skupienie się w pracy nie tylko na kodzie, ale również na inżynierskim opisie architektury, decyzjach projektowych oraz analizie kompromisów (prywatność vs. funkcjonalność, prostota wdrożenia vs. elastyczność).

### Wstępny plan pracy

Poniżej propozycja struktury pracy (rozdziały mogą zostać doprecyzowane na etapie realizacji):

1. **Wstęp**

   - Uzasadnienie wyboru tematu i jego aktualności (rosnące znaczenie prywatności w sieci, popularność VPN i modeli subskrypcyjnych).
   - Cel główny i cele szczegółowe pracy.
   - Zakres pracy oraz krótki opis zastosowanych technologii.

2. **Podstawy teoretyczne**

   - Przegląd technologii VPN i protokołów (WireGuard, OpenVPN, IKEv2, IPSec) – modele bezpieczeństwa, algorytmy kryptograficzne, typowe scenariusze użycia.
   - Porównanie protokołów VPN: **WireGuard vs OpenVPN vs IKEv2 vs IPSec** (wydajność i narzut, prostota konfiguracji, rozmiar kodu i powierzchnia ataku, wsparcie w systemach operacyjnych, scenariusze mobilne vs stacjonarne) oraz uzasadnienie wyboru WireGuard jako protokołu referencyjnego.
   - Omówienie technologii sieciowych wykorzystywanych przez VPN: interfejsy TUN/TAP, routowanie ruchu, NAT, problemy z MTU, obsługa IPv4/IPv6, podejścia do split‑tunnelingu i full‑tunnelingu.
   - Architektury sieciowe i infrastrukturalne dla usług VPN: topologie (hub‑and‑spoke, mesh, multi‑region), metody równoważenia obciążenia (DNS, Anycast, load balancery L4/L7), integracja z chmurowymi sieciami wirtualnymi (VPC, security groups, NACL).
   - Przegląd i porównanie technologii oraz bibliotek do implementacji serwerów VPN i warstwy sterującej: rozwiązania w Rust (np. integracja z `wireguard-go`/`boringtun`, biblioteki sieciowe `tokio`, `hyper`, `axum`, `warp`) vs alternatywy w innych językach (Go, C) oraz podejście „kontrola przez binarkę systemową `wg`”.
   - Modele usług typu SaaS i charakterystyka rozwiązań subskrypcyjnych w kontekście usług VPN.
   - Wymagania niefunkcjonalne systemów VPN: prywatność, brak logowania ruchu, minimalizacja metadanych, skalowalność i dostępność.

3. **Analiza wymagań i projekt systemu vpnVPN**

   - Analiza funkcjonalna: role (użytkownik, administrator), przypadki użycia (zakup subskrypcji, dodanie urządzenia, zarządzanie flotą serwerów).
   - Wymagania niefunkcjonalne (bezpieczeństwo, prywatność, skalowalność, łatwość wdrożenia).
   - Projekt architektury systemu:
     - Podział na frontend, Control Plane i data plane.
     - Model danych (użytkownicy, subskrypcje, urządzenia/peers, serwery VPN).
     - Kontrakty API między komponentami i przepływy danych (diagramy sekwencji).
   - Porównanie możliwych rozwiązań infrastrukturalnych i narzędziowych:
     - **Pulumi vs Terraform vs AWS CDK** – model opisu infrastruktury (deklaratywny vs imperatywny), obsługiwane języki, zarządzanie stanem, integracja z istniejącym ekosystemem TypeScript.
     - **AWS (Lambda + API Gateway + DynamoDB) vs alternatywy chmurowe** (GCP, Azure, self‑hosted Kubernetes) – koszty, łatwość uruchomienia, elastyczność, vendor lock‑in.
     - **Rust vs Go** jako język implementacji serwera VPN – bezpieczeństwo pamięci, ekosystem sieciowy, dostępne biblioteki VPN, łatwość wdrożenia binarek i kontenerów.
     - **Next.js vs inne frameworki frontendowe** (np. Remix, SPA oparte na React) w kontekście SEO, SSR/ISR, integracji z Vercel oraz wygody implementacji panelu SaaS.

4. **Implementacja platformy vpnVPN**

   - **Frontend (Next.js)**:
     - Implementacja uwierzytelniania (SSO, magic link) oraz integracja ze Stripe (Checkout, Portal, webhooki).
     - Projekt i realizacja panelu użytkownika (status subskrypcji, lista urządzeń, generowanie konfiguracji VPN/QR) oraz panelu administracyjnego (zarządzanie serwerami i użytkownikami).
   - **Control Plane (AWS Serverless)**:
     - Definicja infrastruktury jako kodu (Pulumi – DynamoDB, API Gateway, Lambdy).
     - Implementacja kluczowych endpointów (`/server/register`, `/server/peers`, `/peers`, `/server/heartbeat`, webhooki Stripe).
   - **VPN Server (Rust)**:
     - Projekt CLI i konfiguracji (argumenty, zmienne środowiskowe).
     - Implementacja pętli rejestracji i synchronizacji peerów (integracja z WireGuard/OpenVPN).
     - Zbieranie i raportowanie zanonimizowanych metryk oraz zapewnienie braku logowania ruchu.

5. **Integracja, testowanie i wdrożenie**

   - Przygotowanie środowiska lokalnego (docker‑compose, mock Control Plane, lokalna baza danych, testowe subskrypcje Stripe).
   - Testy integracyjne przepływu „koniec‑do‑końca”: rejestracja użytkownika, zakup subskrypcji, dodanie urządzenia, zestawienie tunelu VPN.
   - Opis procesu wdrożenia na środowisko chmurowe (Vercel, AWS) oraz podstawowe procedury operacyjne (dodanie nowego węzła, banowanie użytkownika).

6. **Podsumowanie i kierunki dalszego rozwoju**
   - Ocena stopnia realizacji założeń (funkcjonalnych i niefunkcjonalnych).
   - Analiza ograniczeń zaproponowanego rozwiązania (np. koszty, złożoność operacyjna, zależności od dostawców chmury).
   - Możliwe kierunki rozbudowy: dodatkowe protokoły, zaawansowane polityki routingu, klienci mobilni/desktopowi, funkcje audytu i transparentności (np. publiczne dashboardy metryk, weryfikowalne buildy).

Taka struktura pozwala połączyć część teoretyczną (VPN, SaaS, prywatność) z praktyczną implementacją produkcyjnego rozwiązania, pokazując cały cykl tworzenia systemu – od wymagań i projektu, przez implementację, aż po integrację i wdrożenie.
