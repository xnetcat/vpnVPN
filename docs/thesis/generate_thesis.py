#!/usr/bin/env python3
"""
Generator pracy licencjackiej: "Projekt i implementacja platformy do zarzadzania usluga VPN"
Generuje plik DOCX zgodny z wymaganiami edytorskimi KUL.
"""

import os
import sys
from pathlib import Path

from docx import Document
from docx.shared import Pt, Cm, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
from docxcompose.composer import Composer

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TITLE_PAGE = REPO_ROOT / "docs" / "strona_tytulowa_128197 (1).docx"
OUTPUT_FILE = REPO_ROOT / "docs" / "thesis" / "praca_licencjacka.docx"

# ---------------------------------------------------------------------------
# Helpers: read code from repo
# ---------------------------------------------------------------------------

def read_code(relative_path: str, start: int = 1, end: int | None = None) -> str:
    """Read lines start..end (1-indexed, inclusive) from a repo file."""
    full = REPO_ROOT / relative_path
    if not full.exists():
        return f"[BRAK PLIKU: {relative_path}]"
    lines = full.read_text(encoding="utf-8").splitlines()
    end = end or len(lines)
    return "\n".join(lines[start - 1 : end])


# ---------------------------------------------------------------------------
# Document formatting helpers
# ---------------------------------------------------------------------------

def setup_styles(doc: Document):
    """Configure KUL-compliant styles."""
    style = doc.styles["Normal"]
    font = style.font
    font.name = "Times New Roman"
    font.size = Pt(12)
    font.color.rgb = RGBColor(0, 0, 0)
    pf = style.paragraph_format
    pf.line_spacing = 1.5
    pf.space_after = Pt(0)
    pf.space_before = Pt(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    # Heading 1 — Chapter (14pt bold)
    h1 = doc.styles["Heading 1"]
    h1.font.name = "Times New Roman"
    h1.font.size = Pt(14)
    h1.font.bold = True
    h1.font.color.rgb = RGBColor(0, 0, 0)
    h1.paragraph_format.space_before = Pt(12)
    h1.paragraph_format.space_after = Pt(10)
    h1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h1.paragraph_format.line_spacing = 1.5

    # Heading 2 — Subchapter (12pt bold)
    h2 = doc.styles["Heading 2"]
    h2.font.name = "Times New Roman"
    h2.font.size = Pt(12)
    h2.font.bold = True
    h2.font.italic = False
    h2.font.color.rgb = RGBColor(0, 0, 0)
    h2.paragraph_format.space_before = Pt(6)
    h2.paragraph_format.space_after = Pt(6)
    h2.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h2.paragraph_format.line_spacing = 1.5

    # Heading 3 — Sub-subchapter (12pt italic, no bold)
    h3 = doc.styles["Heading 3"]
    h3.font.name = "Times New Roman"
    h3.font.size = Pt(12)
    h3.font.bold = False
    h3.font.italic = True
    h3.font.color.rgb = RGBColor(0, 0, 0)
    h3.paragraph_format.space_before = Pt(6)
    h3.paragraph_format.space_after = Pt(6)
    h3.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    h3.paragraph_format.line_spacing = 1.5


def setup_page(doc: Document):
    """Set A4 page with KUL margins."""
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.0)
    section.header_distance = Cm(1.25)
    section.footer_distance = Cm(1.25)


def add_page_numbers(doc: Document):
    """Add page numbers to footer."""
    section = doc.sections[0]
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    fld_xml = (
        '<w:fldSimple xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
        ' w:instr="PAGE \\* MERGEFORMAT">'
        '<w:r><w:t>1</w:t></w:r>'
        '</w:fldSimple>'
    )
    run._r.append(parse_xml(fld_xml))


def add_toc(doc: Document):
    """Insert a Table of Contents field."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Spis treści")
    run.bold = True
    run.font.size = Pt(14)
    run.font.name = "Times New Roman"

    p2 = doc.add_paragraph()
    fld_xml = (
        '<w:fldSimple xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
        ' w:instr="TOC \\o &quot;1-3&quot; \\h \\z \\u">'
        '<w:r><w:rPr><w:i/></w:rPr><w:t>[Zaktualizuj spis treści: Ctrl+A, F9]</w:t></w:r>'
        '</w:fldSimple>'
    )
    p2._p.append(parse_xml(fld_xml))
    doc.add_page_break()


def p(doc: Document, text: str):
    """Add a normal justified paragraph."""
    para = doc.add_paragraph(text, style="Normal")
    return para


def p_indent(doc: Document, text: str):
    """Add a paragraph with first-line indent."""
    para = doc.add_paragraph(text, style="Normal")
    para.paragraph_format.first_line_indent = Cm(1.25)
    return para


def add_code(doc: Document, code: str, caption: str, listing_num: str):
    """Add a code listing with caption."""
    # Caption
    cap = doc.add_paragraph()
    cap.paragraph_format.space_before = Pt(6)
    cap.paragraph_format.space_after = Pt(3)
    run = cap.add_run(f"Listing {listing_num}: {caption}")
    run.italic = True
    run.font.size = Pt(10)
    run.font.name = "Times New Roman"

    # Truncate very long code blocks
    lines = code.split("\n")
    if len(lines) > 50:
        lines = lines[:50] + ["    // ... (dalsze linie pominięto dla zwięzłości)"]
        code = "\n".join(lines)

    # Wrap long lines at ~85 chars
    wrapped_lines = []
    for line in code.split("\n"):
        while len(line) > 88:
            wrapped_lines.append(line[:88])
            line = "    " + line[88:]
        wrapped_lines.append(line)
    code = "\n".join(wrapped_lines)

    # Code block
    code_para = doc.add_paragraph()
    code_para.paragraph_format.space_before = Pt(2)
    code_para.paragraph_format.space_after = Pt(6)
    code_para.paragraph_format.line_spacing = 1.0
    code_para.paragraph_format.left_indent = Cm(0.5)
    code_para.paragraph_format.right_indent = Cm(0.5)

    # Add shading
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F2F2F2" w:val="clear"/>')
    code_para._p.get_or_add_pPr().append(shading)

    run = code_para.add_run(code)
    run.font.name = "Courier New"
    run.font.size = Pt(8)


def add_table(doc: Document, headers: list[str], rows: list[list[str]], caption: str, table_num: str):
    """Add a formatted table with caption."""
    cap = doc.add_paragraph()
    cap.paragraph_format.space_before = Pt(8)
    cap.paragraph_format.space_after = Pt(4)
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = cap.add_run(f"Tabela {table_num}: {caption}")
    run.bold = True
    run.font.size = Pt(10)
    run.font.name = "Times New Roman"

    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"

    # Header row
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        rr = cell.paragraphs[0].add_run(h)
        rr.bold = True
        rr.font.size = Pt(10)
        rr.font.name = "Times New Roman"
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="D9E2F3" w:val="clear"/>')
        cell._tc.get_or_add_tcPr().append(shading)

    # Data rows
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = table.rows[ri + 1].cells[ci]
            cell.text = ""
            rr = cell.paragraphs[0].add_run(val)
            rr.font.size = Pt(10)
            rr.font.name = "Times New Roman"

    doc.add_paragraph()  # spacing after table


def add_figure_placeholder(doc: Document, caption: str, fig_num: str):
    """Add a placeholder for a figure or screenshot."""
    para = doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    para.paragraph_format.space_before = Pt(12)
    para.paragraph_format.space_after = Pt(4)

    # Placeholder box
    border_xml = (
        f'<w:pBdr {nsdecls("w")}>'
        '<w:top w:val="single" w:sz="4" w:space="8" w:color="999999"/>'
        '<w:left w:val="single" w:sz="4" w:space="8" w:color="999999"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="8" w:color="999999"/>'
        '<w:right w:val="single" w:sz="4" w:space="8" w:color="999999"/>'
        '</w:pBdr>'
    )
    para._p.get_or_add_pPr().append(parse_xml(border_xml))

    run = para.add_run(f"\n\n[PLACEHOLDER: Wstaw zrzut ekranu / diagram]\n\n")
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor(128, 128, 128)
    run.font.name = "Times New Roman"

    # Caption below
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(8)
    run2 = cap.add_run(f"Rysunek {fig_num}: {caption}")
    run2.italic = True
    run2.font.size = Pt(10)
    run2.font.name = "Times New Roman"


# ===========================================================================
# CHAPTERS
# ===========================================================================

def chapter_1(doc: Document):
    """Rozdział 1: Wstęp"""
    doc.add_heading("1. Wstęp", level=1)

    p(doc,
      "Współczesny Internet, mimo że stanowi fundamentalne narzędzie komunikacji, pracy "
      "i rozrywki, nie zapewnia domyślnie prywatności swoim użytkownikom. Dane przesyłane "
      "przez sieć mogą być przechwytywane, analizowane i profilowane zarówno przez dostawców "
      "usług internetowych, jak i przez podmioty trzecie. W odpowiedzi na te zagrożenia "
      "coraz większą popularność zyskują wirtualne sieci prywatne (VPN), które tworzą "
      "szyfrowane tunele między urządzeniem użytkownika a serwerem pośredniczącym, "
      "ukrywając tym samym zawartość i metadane ruchu sieciowego.")

    p_indent(doc,
      "Rynek usług VPN rośnie dynamicznie — według prognoz GlobalData jego wartość "
      "osiągnie 45 miliardów dolarów do 2027 roku. Wzrost ten napędzany jest przez "
      "regulacje takie jak RODO (GDPR) w Europie, rosnącą świadomość zagrożeń "
      "cybernetycznych oraz potrzebę omijania blokad geograficznych. Jednocześnie "
      "coraz więcej usług przechodzi na model SaaS (Software as a Service), który "
      "umożliwia elastyczne zarządzanie subskrypcjami i skalowanie infrastruktury.")

    p_indent(doc,
      "Mimo dużej liczby komercyjnych dostawców VPN, większość z nich oferuje zamknięte, "
      "nieprzejrzyste rozwiązania, w których użytkownik nie ma możliwości weryfikacji, "
      "jakie dane są rzeczywiście zbierane i przetwarzane. Ponadto brakuje otwartych, "
      "kompletnych implementacji platformy SaaS do zarządzania infrastrukturą VPN, "
      "które mogłyby służyć zarówno jako rozwiązanie produkcyjne, jak i materiał "
      "edukacyjny.")

    doc.add_heading("1.1. Cel pracy", level=2)
    p(doc,
      "Celem niniejszej pracy jest zaprojektowanie i implementacja kompletnej platformy "
      "typu SaaS do zarządzania usługą VPN, nazwanej vpnVPN. Platforma ma umożliwiać "
      "użytkownikom końcowym zakup subskrypcji, zarządzanie urządzeniami i nawiązywanie "
      "szyfrowanych połączeń VPN, a operatorowi — centralne zarządzanie flotą serwerów "
      "VPN rozproszonych geograficznie na zróżnicowanej infrastrukturze.")

    p_indent(doc,
      "Cele szczegółowe pracy obejmują: (1) analizę i porównanie protokołów VPN pod kątem "
      "wydajności, bezpieczeństwa i kompatybilności; (2) zaprojektowanie architektury "
      "wielokomponentowego systemu z podziałem na warstwę prezentacji, sterowania "
      "i danych; (3) implementację czterech głównych komponentów systemu; (4) przeprowadzenie "
      "testów integracyjnych i wdrożenie na środowisko produkcyjne.")

    doc.add_heading("1.2. Zakres pracy", level=2)
    p(doc,
      "Platforma vpnVPN składa się z czterech głównych komponentów:")

    p(doc,
      "- Frontend (web-app) — aplikacja webowa oparta o Next.js 15, odpowiedzialna za "
      "rejestrację i logowanie użytkowników, obsługę płatności (Stripe), panel użytkownika "
      "z zarządzaniem urządzeniami i konfiguracjami VPN oraz panel administracyjny.")

    p(doc,
      "- Control Plane — warstwa sterująca zbudowana na Bun/Fastify z bazą danych "
      "PostgreSQL, przechowująca stan systemu i udostępniająca API REST do rejestracji "
      "węzłów, synchronizacji peerów i zarządzania tokenami.")

    p(doc,
      "- VPN Server — agent napisany w języku Rust, uruchamiany jako kontener Docker "
      "na maszynach wirtualnych, obsługujący trzy protokoły VPN: WireGuard, OpenVPN "
      "i IKEv2/IPsec.")

    p(doc,
      "- Desktop Client — aplikacja desktopowa Tauri z uprzywilejowanym daemonem Rust, "
      "obsługująca WireGuard, OpenVPN i IKEv2 na systemach macOS, Linux i Windows.")

    p_indent(doc,
      "W pracy szczególny nacisk położono na prywatność użytkowników (brak logowania "
      "ruchu, minimalizacja metadanych), bezpieczeństwo komunikacji (nowoczesne algorytmy "
      "kryptograficzne) oraz przejrzystą architekturę umożliwiającą weryfikację przepływu "
      "danych.")

    doc.add_heading("1.3. Struktura pracy", level=2)
    p(doc,
      "Praca składa się z sześciu rozdziałów. Rozdział 1 wprowadza w tematykę i definiuje "
      "cele pracy. Rozdział 2 prezentuje podstawy teoretyczne — protokoły VPN, technologie "
      "sieciowe, model SaaS oraz wymagania niefunkcjonalne. Rozdział 3 zawiera analizę "
      "wymagań i projekt systemu, w tym architekturę, model danych i porównanie technologii. "
      "Rozdział 4 opisuje implementację poszczególnych komponentów z fragmentami kodu. "
      "Rozdział 5 przedstawia integrację, testowanie i wdrożenie. Rozdział 6 zawiera "
      "podsumowanie i kierunki dalszego rozwoju.")


def chapter_2(doc: Document):
    """Rozdział 2: Podstawy teoretyczne"""
    doc.add_heading("2. Podstawy teoretyczne", level=1)

    # 2.1 Protokoły VPN
    doc.add_heading("2.1. Przegląd protokołów VPN", level=2)
    p(doc,
      "Wirtualna sieć prywatna (VPN, Virtual Private Network) to technologia pozwalająca "
      "na utworzenie szyfrowanego tunelu pomiędzy urządzeniem klienckim a serwerem VPN. "
      "Ruch sieciowy przechodzący przez tunel jest zabezpieczony przed podsłuchem i "
      "manipulacją, a adres IP użytkownika jest zastępowany adresem serwera VPN. "
      "W niniejszym podrozdziale omówiono trzy protokoły VPN wykorzystywane w systemie "
      "vpnVPN.")

    doc.add_heading("2.1.1. WireGuard", level=3)
    p(doc,
      "WireGuard to nowoczesny protokół VPN opracowany przez Jasona Donenfelda, "
      "którego pierwsza stabilna wersja została włączona do jądra systemu Linux w marcu "
      "2020 roku (wersja 5.6). Protokół wyróżnia się minimalizmem — jego implementacja "
      "jądrowa liczy około 4000 linii kodu, co jest kilkukrotnie mniej niż w przypadku "
      "OpenVPN czy IPsec.")

    p_indent(doc,
      "WireGuard wykorzystuje protokół Noise IK jako ramy dla uzgadniania kluczy, "
      "a konkretnie algorytmy Curve25519 (wymiana kluczy Diffiego-Hellmana na krzywych "
      "eliptycznych), ChaCha20-Poly1305 (szyfrowanie strumieniowe z uwierzytelnianiem "
      "AEAD), BLAKE2s (funkcja haszująca) oraz SipHash24 (tablica haszująca). Taki dobór "
      "kryptoprimitywy eliminuje problem negocjacji parametrów — wszystkie połączenia "
      "WireGuard korzystają z tego samego zestawu algorytmów, co znacząco redukuje "
      "powierzchnię ataku.")

    p_indent(doc,
      "Z punktu widzenia wydajności WireGuard działa w warstwie 3 modelu OSI (IP), "
      "wykorzystuje wyłącznie protokół UDP i interfejsy TUN. Mechanizm routingu "
      "oparty jest na Cryptokey Routing Table — każdemu peerowi przypisana jest para "
      "klucz publiczny plus dozwolone adresy IP. Protokół nie wymaga zestawiania "
      "połączenia w tradycyjnym sensie — wymiana pakietów inicjujących (handshake) "
      "odbywa się automatycznie przy pierwszym pakiecie danych i jest odnawiana co "
      "2 minuty.")

    p_indent(doc,
      "Istotną cechą WireGuard jest podejście do wersjonowania kryptografii. W przeciwieństwie "
      "do protokołów takich jak TLS czy IPsec, WireGuard nie oferuje negocjacji algorytmów — "
      "używa wyłącznie jednego, starannie dobranego zestawu kryptoprimitywy. Gdy algorytmy "
      "staną się przestarzałe, publikowana jest nowa wersja protokołu z nowym zestawem. "
      "Takie podejście eliminuje ryzyko ataków typu downgrade, w których napastnik wymusza "
      "użycie słabszego algorytmu.")

    p_indent(doc,
      "WireGuard implementuje mechanizm roamingu — jeśli peer zmieni adres IP (np. "
      "przełączenie z WiFi na LTE), wystarczy, że wyśle zaszyfrowany pakiet z nowego adresu, "
      "a serwer automatycznie zaktualizuje endpoint peera. Mechanizm ten, w połączeniu "
      "z PersistentKeepalive (wysyłanie pakietów podtrzymujących co 25 sekund w konfiguracji "
      "vpnVPN), zapewnia stabilne połączenie nawet w warunkach zmiennej łączności sieciowej.")

    doc.add_heading("2.1.2. OpenVPN", level=3)
    p(doc,
      "OpenVPN jest dojrzałym, otwartym rozwiązaniem VPN działającym w przestrzeni "
      "użytkownika (userspace), rozwijany od 2001 roku. Protokół wykorzystuje bibliotekę "
      "OpenSSL do negocjacji sesji TLS i szyfrowania danych, co zapewnia szerokie wsparcie "
      "dla różnych algorytmów kryptograficznych.")

    p_indent(doc,
      "W konfiguracji zastosowanej w systemie vpnVPN OpenVPN używa szyfrowania "
      "AES-256-GCM (z opcją fallback na CHACHA20-POLY1305), protokołu transportowego UDP "
      "na porcie 1194 oraz mechanizmu tls-crypt, który szyfruje cały kanał sterujący TLS "
      "dodatkowym kluczem symetrycznym. Uwierzytelnianie klientów odbywa się za pomocą "
      "nazwy użytkownika i hasła weryfikowanego po stronie serwera przy użyciu skryptu "
      "auth-user-pass-verify z solonym haszem SHA-256.")

    p_indent(doc,
      "Główną zaletą OpenVPN jest dojrzałość ekosystemu i szeroka kompatybilność "
      "z urządzeniami klienckimi. Wadą jest większa złożoność konfiguracji, wyższy "
      "narzut wydajnościowy (praca w przestrzeni użytkownika) oraz znacząco większa "
      "baza kodu w porównaniu z WireGuard.")

    p_indent(doc,
      "OpenVPN obsługuje dwa tryby działania: routowany (dev tun, warstwa 3) i mostkowany "
      "(dev tap, warstwa 2). W systemie vpnVPN wykorzystywany jest tryb routowany, "
      "ponieważ tunelowanie odbywa się na poziomie pakietów IP i nie wymaga "
      "przekazywania ramek Ethernet. Tryb routowany jest również bardziej wydajny "
      "ze względu na mniejszy narzut nagłówkowy.")

    p_indent(doc,
      "Mechanizm tls-crypt zastosowany w vpnVPN dodaje dodatkową warstwę ochrony "
      "poprzez szyfrowanie całego kanału sterującego TLS kluczem symetrycznym współdzielonym "
      "między serwerem a klientem. Dzięki temu: (1) napastnik nie może zidentyfikować "
      "ruchu OpenVPN na podstawie nagłówków TLS (utrudnienie ataków DPI), (2) ataki "
      "denial-of-service na kanał sterujący wymagają znajomości klucza tls-crypt, "
      "(3) certyfikat serwera nie jest ujawniany w trakcie handshake'u TLS.")

    doc.add_heading("2.1.3. IKEv2/IPsec", level=3)
    p(doc,
      "IKEv2 (Internet Key Exchange version 2, RFC 7296) to protokół służący do "
      "negocjacji parametrów bezpieczeństwa i wymiany kluczy w ramach pakietu IPsec. "
      "W systemie vpnVPN implementacja IKEv2 opiera się na strongSwan — otwartej "
      "implementacji IPsec dla systemów Linux, macOS i Windows.")

    p_indent(doc,
      "Kluczową zaletą IKEv2 jest natywne wsparcie w większości systemów operacyjnych "
      "(macOS, iOS, Windows, Android), co eliminuje konieczność instalowania dodatkowego "
      "oprogramowania klienckiego. Protokół obsługuje MOBIKE (Mobility and Multihoming "
      "Protocol, RFC 4555), co pozwala na płynne przełączanie między sieciami (np. WiFi "
      "i LTE) bez zrywania połączenia VPN.")

    p_indent(doc,
      "W konfiguracji vpnVPN IKEv2 używa propozycji szyfrowania AES-256-GCM z ECDH "
      "na krzywej ecp256 (P-256) oraz uwierzytelniania EAP-MSCHAPv2 (login i hasło) "
      "z certyfikatem serwera podpisanym przez wewnętrzny urząd certyfikacji (CA).")

    p_indent(doc,
      "Proces nawiązywania połączenia IKEv2 składa się z dwóch faz: IKE_SA_INIT "
      "(negocjacja parametrów kryptograficznych i wymiana kluczy Diffiego-Hellmana) "
      "oraz IKE_AUTH (uwierzytelnienie stron i ustanowienie pierwszego Child SA). "
      "W konfiguracji vpnVPN serwer uwierzytelnia się certyfikatem ECDSA P-256, "
      "a klient — za pomocą EAP-MSCHAPv2 (login i hasło). Po ustanowieniu tunelu "
      "IPsec ruch szyfrowany jest algorytmem AES-256-GCM z kluczami wymienianymi "
      "co 4 godziny (rekeying).")

    p_indent(doc,
      "Implementacja strongSwan w vpnVPN korzysta z biblioteki gcrypt jako backendu "
      "kryptograficznego. Wybór ECDSA P-256 zamiast RSA podyktowany jest ograniczeniami "
      "gcrypt w kontekście generowania kluczy RSA w bibliotece rcgen (Rust), a także "
      "mniejszym rozmiarem kluczy ECDSA (32 bajty vs 256+ bajtów dla RSA-2048) i "
      "szybszym podpisywaniem.")

    # Tabela porównawcza
    add_table(doc,
        ["Protokół", "Algorytmy kryptograficzne", "Główne zalety", "Główne wady", "Zastosowanie w vpnVPN"],
        [
            ["WireGuard", "ChaCha20-Poly1305, Curve25519, BLAKE2s",
             "Wysoka wydajność, minimalny kod (~4000 LOC), prosta konfiguracja",
             "Młodszy protokół, brak negocjacji parametrów",
             "Protokół podstawowy, najwyższa wydajność"],
            ["OpenVPN", "AES-256-GCM, TLS 1.3, tls-crypt",
             "Dojrzały ekosystem (20+ lat), szeroka kompatybilność",
             "Złożona konfiguracja, większy narzut, większa powierzchnia ataku",
             "Kompatybilność z legacy"],
            ["IKEv2/IPsec", "AES-256-GCM, ECDH P-256, EAP-MSCHAPv2",
             "Natywne wsparcie OS, MOBIKE (mobilność)",
             "Złożoność implementacji, zależność od IPsec",
             "Klienci bez dodatkowego oprogramowania"],
        ],
        "Porównanie protokołów VPN wykorzystywanych w systemie vpnVPN", "1")

    # 2.2 Technologie sieciowe
    doc.add_heading("2.2. Technologie sieciowe dla VPN", level=2)
    p(doc,
      "Działanie sieci VPN opiera się na kilku fundamentalnych mechanizmach sieciowych, "
      "które umożliwiają tunelowanie, routing i translację adresów.")

    doc.add_heading("2.2.1. Interfejsy TUN/TAP", level=3)
    p(doc,
      "Interfejsy TUN i TAP to wirtualne urządzenia sieciowe dostępne w jądrze systemu "
      "Linux (oraz w innych systemach uniksowych). Interfejs TUN (tunnel) operuje w "
      "warstwie 3 modelu OSI — przyjmuje i generuje pakiety IP. Interfejs TAP (network "
      "tap) operuje w warstwie 2 — przetwarza ramki Ethernet. W systemie vpnVPN "
      "wszystkie trzy protokoły VPN korzystają z interfejsów TUN (urządzenie /dev/net/tun), "
      "ponieważ tunelowanie odbywa się na poziomie pakietów IP.")

    doc.add_heading("2.2.2. Routing i NAT", level=3)
    p(doc,
      "Po zestawieniu interfejsu tunelowego konieczne jest skonfigurowanie routingu, "
      "aby pakiety od klientów VPN mogły dotrzeć do Internetu. W systemie vpnVPN "
      "serwer VPN pełni rolę bramy domyślnej dla klientów — ruch kierowany jest do "
      "interfejsu tunelowego (np. wg0 dla WireGuard), a następnie przesyłany do "
      "domyślnego interfejsu sieciowego hosta za pomocą mechanizmu NAT (Network Address "
      "Translation) w trybie maskaradowania (MASQUERADE).")

    p_indent(doc,
      "Konfiguracja wymaga: (1) włączenia przekazywania pakietów IPv4 i IPv6 "
      "(sysctl net.ipv4.ip_forward=1, net.ipv6.conf.all.forwarding=1); (2) dodania "
      "reguły iptables -t nat -A POSTROUTING -o <interfejs> -j MASQUERADE; (3) zezwolenia "
      "na ruch pomiędzy interfejsem VPN a interfejsem domyślnym w łańcuchu FORWARD.")

    doc.add_heading("2.2.3. MTU i fragmentacja", level=3)
    p(doc,
      "Tunelowanie wprowadza dodatkowy narzut nagłówkowy, co wymaga odpowiedniego "
      "ustawienia MTU (Maximum Transmission Unit). Standardowe MTU dla Ethernetu wynosi "
      "1500 bajtów. WireGuard dodaje 60 bajtów narzutu (nagłówek UDP + WireGuard), "
      "dlatego w systemie vpnVPN MTU interfejsu wg0 ustawione jest na 1420 bajtów. "
      "OpenVPN i IKEv2/IPsec mają podobne wymagania, choć dokładne wartości zależą "
      "od wybranego szyfrowania i trybu transportu.")

    doc.add_heading("2.2.4. Adresacja IPv4 i IPv6", level=3)
    p(doc,
      "System vpnVPN przydziela klientom adresy z prywatnych pul: 10.8.0.0/24 dla "
      "WireGuard, 10.9.0.0/24 dla OpenVPN i IKEv2, oraz fd42:42:42::/64 dla IPv6 "
      "(WireGuard). Adresy przydzielane są deterministycznie na podstawie identyfikatora "
      "użytkownika, co eliminuje konflikty adresów i umożliwia odtworzenie konfiguracji "
      "bez przechowywania stanu alokacji.")

    # 2.3 Architektury
    doc.add_heading("2.3. Architektury infrastrukturalne dla usług VPN", level=2)
    p(doc,
      "Usługi VPN mogą być wdrażane w różnych topologiach, w zależności od wymagań "
      "dotyczących skalowalności, opóźnień i redundancji:")

    p(doc,
      "- Hub-and-spoke — centralna architektura, w której wszystkie węzły VPN "
      "komunikują się z centralnym serwerem sterującym. Taka topologia jest prosta "
      "w zarządzaniu, ale centralny punkt stanowi single point of failure.")

    p(doc,
      "- Multi-region — rozproszona architektura z węzłami VPN w wielu regionach "
      "geograficznych. Użytkownicy mogą wybierać serwer najbliższy ich lokalizacji, "
      "co minimalizuje opóźnienia. System vpnVPN stosuje tę architekturę z centralnym "
      "Control Plane i rozproszonymi węzłami VPN.")

    p(doc,
      "- Mesh — każdy węzeł komunikuje się bezpośrednio z innymi węzłami, co eliminuje "
      "single point of failure, ale znacząco zwiększa złożoność zarządzania.")

    p_indent(doc,
      "W systemie vpnVPN zastosowano architekturę hub-and-spoke z elementami multi-region: "
      "centralny Control Plane (wdrożony na Railway) zarządza flotą węzłów VPN "
      "rozproszonych na maszynach wirtualnych w różnych lokalizacjach. Węzły samodzielnie "
      "rejestrują się w Control Plane i cyklicznie synchronizują listę dozwolonych "
      "peerów.")

    # 2.4 Technologie implementacji
    doc.add_heading("2.4. Technologie i biblioteki do implementacji serwera VPN", level=2)
    p(doc,
      "Wybór języka programowania i bibliotek ma kluczowe znaczenie dla bezpieczeństwa "
      "i wydajności serwera VPN. Poniższa tabela porównuje technologie rozważane w "
      "projekcie vpnVPN.")

    add_table(doc,
        ["Warstwa", "Technologie", "Zalety", "Wady"],
        [
            ["Interfejs protokołu", "WireGuard w jądrze, wireguard-go, boringtun",
             "Wysoka wydajność, wsparcie jądra", "Zależność od platformy"],
            ["Runtime asynchroniczny", "tokio (Rust), async-std",
             "Wydajny model async (epoll/kqueue), zero-cost abstractions",
             "Stroma krzywa uczenia"],
            ["HTTP / API", "axum, hyper, warp (Rust)",
             "Nowoczesne, bezpieczne, integracja z tokio",
             "Mniejszy ekosystem niż Node/Go"],
            ["Integracja z wg", "Binarka systemowa wg, wireguard-control",
             "Prosta integracja, niezawodność", "Zależność od narzędzi systemowych"],
        ],
        "Technologie i biblioteki sieciowe dla serwera VPN", "2")

    # 2.5 Model SaaS
    doc.add_heading("2.5. Model SaaS i usługi subskrypcyjne", level=2)
    p(doc,
      "SaaS (Software as a Service) to model dystrybucji oprogramowania, w którym "
      "aplikacja jest hostowana centralnie i udostępniana użytkownikom przez Internet, "
      "najczęściej na zasadach subskrypcji. W kontekście usług VPN model SaaS oferuje "
      "kilka kluczowych korzyści:")

    p(doc,
      "- Automatyczne aktualizacje — użytkownicy nie muszą ręcznie aktualizować "
      "oprogramowania serwerowego.")

    p(doc,
      "- Skalowalność — operator może dynamicznie dodawać i usuwać węzły VPN "
      "w odpowiedzi na zapotrzebowanie.")

    p(doc,
      "- Elastyczne modele cenowe — wielopoziomowe plany subskrypcyjne pozwalają "
      "dostosować ofertę do różnych segmentów klientów.")

    p_indent(doc,
      "System vpnVPN implementuje model SaaS z czterema planami: Free (bezpłatny, "
      "1 urządzenie, ograniczona przepustowość), Basic (10 USD/miesiąc, 1 urządzenie), "
      "Pro (30 USD/miesiąc, 5 urządzeń) i Enterprise (1000 USD/miesiąc, nielimitowana "
      "liczba urządzeń). Obsługa płatności realizowana jest przez Stripe z mechanizmem "
      "webhooków do automatycznej synchronizacji statusu subskrypcji.")

    p_indent(doc,
      "Architektura SaaS w vpnVPN opiera się na wzorcu event-driven: zdarzenia Stripe "
      "(checkout.session.completed, customer.subscription.updated, customer.subscription.deleted) "
      "są przetwarzane asynchronicznie przez webhook handler. Każde zdarzenie wyzwala "
      "odpowiednie akcje: aktywację subskrypcji i wysłanie e-maila powitalnego, "
      "aktualizację planu, lub anulowanie subskrypcji z natychmiastowym odwołaniem "
      "wszystkich peerów VPN użytkownika. Taki model zapewnia spójność stanu systemu "
      "nawet w przypadku awarii lub opóźnień w przetwarzaniu.")

    p_indent(doc,
      "Wielopoziomowa struktura planów (tiering) implementowana jest przez mapowanie "
      "identyfikatorów cen Stripe (priceId) na konfigurację planu (limit urządzeń, "
      "dostępne funkcje). Mapowanie przechowywane jest w pliku tiers.ts i jest "
      "wykorzystywane zarówno po stronie frontendu (wyświetlanie cennika), jak i "
      "backendu (weryfikacja limitów przy rejestracji urządzeń).")

    # 2.6 Wymagania niefunkcjonalne
    doc.add_heading("2.6. Wymagania niefunkcjonalne systemów VPN", level=2)
    p(doc,
      "Systemy VPN, ze względu na przetwarzanie wrażliwych danych sieciowych, muszą "
      "spełniać szereg wymagań niefunkcjonalnych:")

    p(doc,
      "Prywatność — brak logowania ruchu sieciowego (no-logging policy) jest fundamentalnym "
      "wymogiem. System powinien przechowywać jedynie minimalne metadane niezbędne do "
      "funkcjonowania usługi (klucze publiczne, zagregowane liczniki sesji).")

    p(doc,
      "Bezpieczeństwo — wszystkie połączenia API muszą być zabezpieczone protokołem TLS, "
      "a materiał kryptograficzny (klucze prywatne, hasła) przechowywany z odpowiednimi "
      "uprawnieniami (chmod 0600) i usuwany z pamięci po użyciu (zerowanie pamięci).")

    p(doc,
      "Skalowalność — architektura powinna umożliwiać dodawanie nowych węzłów VPN "
      "bez przerw w działaniu usługi i bez modyfikacji istniejących komponentów.")

    p(doc,
      "Dostępność — system powinien być odporny na awarie pojedynczych komponentów "
      "i umożliwiać automatyczne wykrywanie nieosiągalnych węzłów.")

    p_indent(doc,
      "W kontekście systemów VPN szczególne znaczenie ma zasada privacy by design, "
      "zgodna z duchem RODO (Rozporządzenie 2016/679). Oznacza to, że mechanizmy "
      "ochrony prywatności powinny być wbudowane w architekturę systemu od samego "
      "początku, a nie dodawane ex post. W praktyce przekłada się to na decyzje "
      "projektowe takie jak: konfiguracja protokołów VPN z wyłączonym logowaniem, "
      "przechowywanie wyłącznie zagregowanych metryk (bez adresów IP użytkowników), "
      "automatyczne zerowanie materiału kryptograficznego z pamięci oraz "
      "minimalizacja danych przekazywanych między komponentami systemu.")

    p_indent(doc,
      "Aspekt skalowalności realizowany jest w vpnVPN przez architekturę pull-based: "
      "węzły VPN samodzielnie pobierają konfigurację z Control Plane, co eliminuje "
      "problem push-based distribution (konieczność utrzymywania otwartych połączeń "
      "do wszystkich węzłów). Dodanie nowego węzła wymaga jedynie uruchomienia kontenera "
      "Docker z odpowiednimi zmiennymi środowiskowymi — węzeł automatycznie rejestruje "
      "się i rozpoczyna obsługę klientów.")


def chapter_3(doc: Document):
    """Rozdział 3: Analiza wymagań i projekt systemu"""
    doc.add_heading("3. Analiza wymagań i projekt systemu vpnVPN", level=1)

    # 3.1 Analiza funkcjonalna
    doc.add_heading("3.1. Analiza funkcjonalna", level=2)
    p(doc,
      "System vpnVPN obsługuje dwie podstawowe role: użytkownika końcowego oraz "
      "administratora. Każda z ról ma zdefiniowany zestaw dostępnych funkcji.")

    p(doc, "Użytkownik końcowy może:")
    p(doc, "- zarejestrować się i zalogować (OAuth: GitHub, Google; magic link e-mail),")
    p(doc, "- wykupić subskrypcję w jednym z czterech planów (Free, Basic, Pro, Enterprise),")
    p(doc, "- zarządzać urządzeniami VPN (dodawanie, usuwanie, pobieranie konfiguracji),")
    p(doc, "- przeglądać listę dostępnych serwerów VPN z ich statusem i metrykami,")
    p(doc, "- zarządzać ustawieniami konta i preferencjami powiadomień.")

    p(doc, "Administrator może:")
    p(doc, "- monitorować flotę serwerów VPN (status, metryki, obciążenie),")
    p(doc, "- zarządzać tokenami rejestracyjnymi dla węzłów VPN,")
    p(doc, "- przeglądać katalog użytkowników z informacjami o subskrypcjach,")
    p(doc, "- analizować zagregowane statystyki (sesje, dystrybucja geograficzna, kondycja serwerów).")

    # 3.2 Wymagania niefunkcjonalne
    doc.add_heading("3.2. Wymagania niefunkcjonalne", level=2)

    add_table(doc,
        ["Wymaganie", "Opis", "Realizacja w vpnVPN"],
        [
            ["Prywatność", "Brak logowania ruchu, minimalizacja metadanych",
             "Wyłączone logi VPN, przechowywane tylko klucze publiczne i liczniki sesji"],
            ["Bezpieczeństwo", "Szyfrowanie end-to-end, ochrona materiału kryptograficznego",
             "TLS na wszystkich API, klucze z prawami 0600, zerowanie pamięci (Zeroizing)"],
            ["Skalowalność", "Możliwość dodawania węzłów bez przestojów",
             "Samoobsługowa rejestracja węzłów, centralne zarządzanie peerami"],
            ["Dostępność", "Odporność na awarie komponentów",
             "Heartbeat co 2 minuty, automatyczna detekcja offline (5-min timeout)"],
            ["Wydajność", "Niskie opóźnienia, wysoka przepustowość",
             "WireGuard jako protokół referencyjny, architektura multi-region"],
        ],
        "Wymagania niefunkcjonalne systemu vpnVPN", "3")

    # 3.3 Architektura
    doc.add_heading("3.3. Architektura systemu", level=2)
    p(doc,
      "System vpnVPN składa się z czterech głównych komponentów komunikujących się "
      "przez HTTPS/REST API. Poniższy diagram przedstawia architekturę wysokiego poziomu.")

    add_figure_placeholder(doc, "Architektura systemu vpnVPN — cztery główne komponenty", "1")

    p(doc,
      "Frontend (apps/web) — aplikacja Next.js 15 wdrożona na platformie Vercel. "
      "Komunikuje się z Control Plane przez API REST z uwierzytelnianiem kluczem API "
      "(nagłówek x-api-key). Odpowiada za interfejs użytkownika i administratora, "
      "uwierzytelnianie (NextAuth.js), obsługę płatności (Stripe) i wysyłkę e-maili "
      "(Resend).")

    p(doc,
      "Control Plane (services/control-plane) — serwis HTTP oparty na Bun/Fastify, "
      "wdrożony na platformie Railway. Stanowi centralny punkt zarządzania stanem systemu. "
      "Przechowuje informacje o serwerach VPN, peerach, tokenach i metrykach w bazie "
      "PostgreSQL (Neon). Udostępnia dwa rodzaje uwierzytelniania: Bearer token dla "
      "węzłów VPN oraz klucz API dla aplikacji webowej.")

    p(doc,
      "VPN Server (apps/vpn-server) — binarka Rust uruchamiana jako kontener Docker "
      "z uprawnieniami NET_ADMIN. Obsługuje trzy backendy VPN (WireGuard, OpenVPN, IKEv2), "
      "rejestruje się w Control Plane, cyklicznie synchronizuje listę peerów i raportuje "
      "metryki. Udostępnia admin API z endpointami /health, /metrics, /status i /pubkey.")

    p(doc,
      "Desktop Client (apps/desktop) — aplikacja Tauri z podziałem na nieuprzywilejowany "
      "interfejs graficzny (React + Vite) i uprzywilejowany daemon Rust komunikujący się "
      "przez Unix socket (IPC, JSON-RPC). Daemon zarządza połączeniami VPN na poziomie "
      "systemowym.")

    # 3.4 Model danych
    doc.add_heading("3.4. Model danych", level=2)
    p(doc,
      "Model danych systemu vpnVPN zdefiniowany jest za pomocą Prisma ORM i obejmuje "
      "12 tabel w bazie PostgreSQL. Kluczowe encje to:")

    p(doc,
      "- User — użytkownik systemu z powiązaniem do konta Stripe (stripeCustomerId),")
    p(doc,
      "- Subscription — subskrypcja Stripe z informacjami o planie (tier) i statusie,")
    p(doc,
      "- Device — urządzenie klienckie z kluczem publicznym i przypisanym serwerem,")
    p(doc,
      "- VpnServer — węzeł VPN z danymi o endpointach, kluczu publicznym i statusie,")
    p(doc,
      "- VpnPeer — peer sieciowy łączący użytkownika z serwerem (klucz publiczny, dozwolone IP),")
    p(doc,
      "- VpnToken — token rejestracyjny dla węzłów VPN ze śledzeniem użycia,")
    p(doc,
      "- VpnMetric — metryka czasowa (CPU, pamięć, aktywne sesje) dla danego serwera.")

    add_figure_placeholder(doc, "Diagram relacji encji (ERD) systemu vpnVPN", "2")

    # Listing schematu Prisma (kluczowe modele)
    prisma_code = read_code("packages/db/prisma/schema.prisma", 14, 32)
    prisma_code += "\n\n// ... (modele Subscription, Device) ...\n\n"
    prisma_code += read_code("packages/db/prisma/schema.prisma", 127, 175)
    add_code(doc, prisma_code, "Kluczowe modele bazy danych (Prisma schema)", "3.1")

    # 3.5 Kontrakty API
    doc.add_heading("3.5. Kontrakty API", level=2)
    p(doc,
      "Komunikacja między komponentami odbywa się za pośrednictwem API REST (Control Plane) "
      "i tRPC (Frontend). Poniższa tabela przedstawia endpointy Control Plane.")

    add_table(doc,
        ["Endpoint", "Metoda", "Uwierzytelnianie", "Opis"],
        [
            ["POST /server/register", "POST", "Bearer token", "Rejestracja węzła VPN"],
            ["GET /server/peers", "GET", "Bearer token", "Pobranie peerów dla serwera"],
            ["GET /servers", "GET", "API key", "Lista wszystkich serwerów"],
            ["DELETE /servers/:id", "DELETE", "API key", "Usunięcie serwera"],
            ["POST /peers", "POST", "API key", "Utworzenie/aktualizacja peera"],
            ["POST /peers/revoke-for-user", "POST", "API key", "Odwołanie peerów użytkownika"],
            ["DELETE /peers/:publicKey", "DELETE", "API key", "Odwołanie konkretnego peera"],
            ["GET /tokens", "GET", "API key", "Lista tokenów"],
            ["POST /tokens", "POST", "API key", "Utworzenie tokenu"],
            ["DELETE /tokens/:token", "DELETE", "API key", "Odwołanie tokenu"],
            ["POST /metrics/vpn", "POST", "Brak", "Przyjęcie metryk VPN"],
        ],
        "Endpointy Control Plane API", "4")

    p(doc,
      "Aplikacja webowa komunikuje się z Control Plane za pośrednictwem modułu "
      "controlPlane.ts, a z użytkownikiem — przez procedury tRPC. Główne routery tRPC to:")

    add_table(doc,
        ["Router", "Procedury", "Typ autoryzacji"],
        [
            ["device", "register, list", "paidProcedure"],
            ["billing", "createCheckoutSession, createPortalSession", "protectedProcedure"],
            ["account", "get, updateProfile, updateNotifications", "protectedProcedure"],
            ["servers", "list", "paidProcedure"],
            ["admin", "listServers, deleteServer, listTokens, createToken, revokeToken", "adminProcedure"],
            ["analytics", "summary, historicalMetrics, geoDistribution, serverHealth", "adminProcedure"],
            ["desktop", "resolveCode", "publicProcedure"],
        ],
        "Procedury tRPC aplikacji webowej", "5")

    # 3.6 Porównanie technologii
    doc.add_heading("3.6. Porównanie wybranych technologii", level=2)
    p(doc,
      "W trakcie projektowania systemu vpnVPN przeanalizowano i porównano różne "
      "technologie i narzędzia pod kątem wymagań projektu. Poniższe tabele prezentują "
      "kluczowe porównania, które wpłynęły na decyzje projektowe.")

    doc.add_heading("3.6.1. Języki programowania serwera VPN", level=3)

    add_table(doc,
        ["Język", "Zalety w kontekście VPN", "Wady", "Użycie w projekcie"],
        [
            ["Rust", "Bezpieczeństwo pamięci, brak GC, wydajność C/C++",
             "Stroma krzywa uczenia", "Główny język serwera VPN"],
            ["Go", "Prosty model współbieżności, bogaty ekosystem sieciowy",
             "GC, mniejsza kontrola niskopoziomowa", "Rozważany jako alternatywa"],
            ["C", "Maksymalna kontrola, najwyższa wydajność",
             "Brak bezpieczeństwa pamięci, podatność na błędy", "Tylko w komponentach zewnętrznych"],
        ],
        "Porównanie języków implementacji serwera VPN", "6")

    doc.add_heading("3.6.2. Frameworki frontendowe", level=3)

    add_table(doc,
        ["Framework", "Zalety", "Wady", "Użycie"],
        [
            ["Next.js (App Router)", "SSR/ISR, integracja z Vercel, SEO, full-stack",
             "Dodatkowa złożoność vs SPA", "Wybrany"],
            ["Remix", "Silny REST/HTTP focus, nowoczesny routing",
             "Mniejszy ekosystem", "Analizowany"],
            ["SPA (React + Vite)", "Prostota, elastyczność",
             "Wymaga osobnego backendu, gorsze SEO", "Użyty w desktop"],
        ],
        "Porównanie frameworków frontendowych", "7")

    doc.add_heading("3.6.3. Platformy wdrożeniowe", level=3)

    add_table(doc,
        ["Platforma", "Komponent", "Zalety", "Wady"],
        [
            ["Vercel", "Frontend (Next.js)", "Automatyczne HTTPS, CDN, edge functions",
             "Ograniczenia serverless"],
            ["Railway", "Control Plane", "Prosty deploy Docker, auto-deploy z GitHub",
             "Mniejsza kontrola niż AWS"],
            ["Manualne VM", "VPN Server", "Pełna kontrola, NET_ADMIN, host networking",
             "Wymaga ręcznego provisioningu"],
            ["GitHub Releases", "Desktop Client", "Multi-platform builds, CI/CD",
             "Brak auto-update (wymaga implementacji)"],
        ],
        "Platformy wdrożeniowe komponentów vpnVPN", "8")

    # 3.7 Diagramy sekwencji
    doc.add_heading("3.7. Przepływy danych", level=2)
    p(doc,
      "Poniższe diagramy sekwencji przedstawiają kluczowe przepływy danych w systemie "
      "vpnVPN.")

    doc.add_heading("3.7.1. Przepływ subskrypcji", level=3)
    p(doc,
      "Proces zakupu subskrypcji: (1) Użytkownik wybiera plan na stronie z cennikiem. "
      "(2) Frontend tworzy sesję Stripe Checkout przez tRPC. (3) Użytkownik dokonuje "
      "płatności na stronie Stripe. (4) Stripe wysyła webhook checkout.session.completed "
      "do backendu. (5) Backend aktualizuje subskrypcję w bazie danych. (6) Użytkownik "
      "otrzymuje e-mail potwierdzający.")

    add_figure_placeholder(doc, "Diagram sekwencji — przepływ subskrypcji", "3")

    doc.add_heading("3.7.2. Provisioning peera", level=3)
    p(doc,
      "Dodanie urządzenia VPN: (1) Użytkownik klika 'Dodaj urządzenie' w dashboardzie. "
      "(2) Serwer generuje parę kluczy WireGuard. (3) Rekord Device jest zapisywany "
      "w bazie danych. (4) Control Plane jest informowany o nowym peerze (POST /peers). "
      "(5) Konfiguracja VPN (.conf) jest generowana i udostępniana do pobrania.")

    add_figure_placeholder(doc, "Diagram sekwencji — provisioning peera", "4")

    doc.add_heading("3.7.3. Rejestracja węzła VPN i synchronizacja", level=3)
    p(doc,
      "Cykl życia węzła VPN: (1) Przy starcie węzeł uruchamia backendy VPN i generuje "
      "klucze. (2) Węzeł rejestruje się w Control Plane (POST /server/register). "
      "(3) Co 2 sekundy węzeł pobiera listę peerów (GET /server/peers). (4) Peery "
      "są aplikowane do wszystkich aktywnych backendów (WireGuard: wg syncconf, "
      "OpenVPN: aktualizacja secrets.txt, IKEv2: swanctl --load-all). (5) Co 2 minuty "
      "węzeł wysyła heartbeat (ponowna rejestracja). (6) Control Plane oznacza serwery "
      "jako offline po 5 minutach bez heartbeatu.")

    add_figure_placeholder(doc, "Diagram sekwencji — rejestracja węzła i synchronizacja peerów", "5")


def chapter_4(doc: Document):
    """Rozdział 4: Implementacja"""
    doc.add_heading("4. Implementacja platformy vpnVPN", level=1)

    p(doc,
      "W niniejszym rozdziale przedstawiono szczegóły implementacji poszczególnych "
      "komponentów systemu vpnVPN z fragmentami kodu źródłowego. Wszystkie listingi "
      "pochodzą z rzeczywistego kodu produkcyjnego projektu.")

    # -----------------------------------------------------------------------
    # 4.1 Frontend
    # -----------------------------------------------------------------------
    doc.add_heading("4.1. Frontend (Next.js)", level=2)
    p(doc,
      "Aplikacja webowa oparta jest na Next.js 15 z App Router i wykorzystuje TypeScript, "
      "Tailwind CSS, tRPC v11 i Prisma ORM. Wdrożona jest na platformie Vercel z "
      "automatycznym deployem z gałęzi main (produkcja) i staging (środowisko testowe).")

    # 4.1.1 Uwierzytelnianie
    doc.add_heading("4.1.1. System uwierzytelniania", level=3)
    p(doc,
      "System uwierzytelniania oparty jest o NextAuth.js z trzema dostawcami: GitHub, "
      "Google (OAuth 2.0) oraz e-mail (magic link przez Resend). Dodatkowo "
      "zaimplementowano specjalny przepływ logowania dla aplikacji desktopowej, "
      "wykorzystujący 6-cyfrowy kod OTP.")

    p_indent(doc,
      "Warstwa autoryzacji tRPC definiuje cztery poziomy procedur z rosnącymi "
      "wymaganiami dostępu: publicProcedure (bez autoryzacji), protectedProcedure "
      "(zalogowany użytkownik), paidProcedure (aktywna subskrypcja lub admin) oraz "
      "adminProcedure (rola admin).")

    add_code(doc,
             read_code("apps/web/lib/trpc/init.ts", 69, 153),
             "Middleware uwierzytelniania tRPC (init.ts)", "4.1")

    p(doc,
      "Procedura paidProcedure implementuje hierarchię dostępu: administratorzy "
      "otrzymują automatycznie uprawnienia poziomu enterprise, użytkownicy bez subskrypcji "
      "otrzymują dostęp do planu free (1 urządzenie), a pozostali — zgodnie z ich "
      "aktywnym planem subskrypcyjnym.")

    # 4.1.2 Stripe
    doc.add_heading("4.1.2. Integracja z systemem płatności Stripe", level=3)
    p(doc,
      "Obsługa płatności realizowana jest przez Stripe z mechanizmem Checkout "
      "(tworzenie sesji płatności), Customer Portal (zarządzanie subskrypcją) "
      "i webhooków (automatyczna synchronizacja statusu).")

    add_code(doc,
             read_code("apps/web/lib/trpc/routers/billing.ts", 1, 76),
             "Tworzenie sesji Stripe Checkout (billing.ts)", "4.2")

    p(doc,
      "Webhook Stripe obsługuje zdarzenia checkout.session.completed, "
      "customer.subscription.updated i customer.subscription.deleted. W przypadku "
      "anulowania subskrypcji automatycznie odwoływane są wszystkie peery użytkownika "
      "w Control Plane, co natychmiast blokuje dostęp do VPN.")

    p_indent(doc,
      "Proces tworzenia sesji Checkout obejmuje: weryfikację konfiguracji Stripe, "
      "pobranie lub utworzenie klienta Stripe (customer) powiązanego z użytkownikiem "
      "vpnVPN, a następnie utworzenie sesji Checkout z podanym identyfikatorem ceny "
      "(priceId). Sesja konfigurowana jest z przekierowaniem na dashboard po sukcesie "
      "lub na stronę cennika po anulowaniu. Włączona jest obsługa kodów promocyjnych "
      "(allow_promotion_codes: true).")

    # 4.1.3 Konfiguracja planów
    doc.add_heading("4.1.3. Konfiguracja planów subskrypcyjnych", level=3)

    add_code(doc,
             read_code("apps/web/lib/tiers.ts", 1, 64),
             "Definicje planów subskrypcyjnych (tiers.ts)", "4.3")

    add_table(doc,
        ["Plan", "Cena (USD/mies.)", "Limit urządzeń", "Kluczowe funkcje"],
        [
            ["Free", "0", "1", "Ograniczona przepustowość, dostęp do wszystkich serwerów"],
            ["Basic", "10", "1", "Nieograniczona przepustowość, wsparcie e-mail"],
            ["Pro", "30", "5", "5 urządzeń, priorytetowe wsparcie, zaawansowane metryki"],
            ["Enterprise", "1000", "999", "Dedykowane wsparcie, niestandardowe integracje"],
        ],
        "Plany subskrypcyjne vpnVPN", "9")

    # 4.1.4 Zrzuty ekranu
    doc.add_heading("4.1.4. Interfejs użytkownika", level=3)
    p(doc,
      "Poniższe zrzuty ekranu prezentują kluczowe widoki aplikacji webowej.")

    add_figure_placeholder(doc, "Strona główna vpnVPN z metrykami floty serwerów", "6")
    add_figure_placeholder(doc, "Strona z cennikiem — wybór planu subskrypcyjnego", "7")
    add_figure_placeholder(doc, "Panel użytkownika — dashboard z przeglądem konta", "8")
    add_figure_placeholder(doc, "Panel użytkownika — zarządzanie urządzeniami VPN", "9")
    add_figure_placeholder(doc, "Panel użytkownika — lista serwerów VPN z metrykami", "10")
    add_figure_placeholder(doc, "Panel administratora — zarządzanie flotą serwerów", "11")

    # -----------------------------------------------------------------------
    # 4.2 Control Plane
    # -----------------------------------------------------------------------
    doc.add_heading("4.2. Control Plane (Bun/Fastify)", level=2)
    p(doc,
      "Control Plane to centralny komponent sterujący systemu, zbudowany na Bun "
      "(szybki runtime JavaScript/TypeScript) i frameworku Fastify. Cały serwis "
      "zaimplementowany jest w jednym pliku server.ts (~576 linii) i wdrożony na "
      "platformie Railway jako kontener Docker.")

    # 4.2.1 Walidacja
    doc.add_heading("4.2.1. Walidacja danych wejściowych (Zod)", level=3)
    p(doc,
      "Wszystkie dane wejściowe API są walidowane za pomocą biblioteki Zod, która "
      "zapewnia type-safe walidację w czasie wykonania.")

    add_code(doc,
             read_code("services/control-plane/src/server.ts", 22, 44),
             "Schematy walidacji Zod (server.ts)", "4.4")

    # 4.2.2 Rejestracja serwera
    doc.add_heading("4.2.2. Rejestracja węzła VPN", level=3)
    p(doc,
      "Endpoint POST /server/register umożliwia węzłom VPN samoobsługową rejestrację "
      "w systemie. Węzeł przesyła swój identyfikator, klucz publiczny WireGuard, port "
      "nasłuchiwania oraz metadane (region, kraj, adresy endpointów dla poszczególnych "
      "protokołów). Control Plane dokonuje upsert (insert or update) rekordu serwera "
      "i zwiększa licznik użycia tokenu.")

    add_code(doc,
             read_code("services/control-plane/src/server.ts", 71, 84),
             "Schemat rejestracji serwera (server.ts)", "4.5")

    # 4.2.3 Synchronizacja peerów
    doc.add_heading("4.2.3. Synchronizacja peerów", level=3)
    p(doc,
      "Endpoint GET /server/peers zwraca listę aktywnych peerów przypisanych do danego "
      "serwera. Węzły VPN odpytują ten endpoint co 2 sekundy, a Control Plane zwraca "
      "peery w formacie snake_case oczekiwanym przez serwer Rust. Peery filtrowane są "
      "po serverId lub są oznaczone jako 'unpinned' (serverId=null).")

    # -----------------------------------------------------------------------
    # 4.3 VPN Server (Rust)
    # -----------------------------------------------------------------------
    doc.add_heading("4.3. VPN Server (Rust)", level=2)
    p(doc,
      "Serwer VPN to program napisany w języku Rust, wykorzystujący runtime asynchroniczny "
      "Tokio i framework HTTP Axum. Kod źródłowy liczy około 3557 linii w 50+ modułach "
      "i obsługuje trzy protokoły VPN przez zunifikowany interfejs cechy (trait) VpnBackend.")

    # 4.3.1 CLI
    doc.add_heading("4.3.1. Interfejs wiersza poleceń (CLI)", level=3)
    p(doc,
      "Konfiguracja serwera VPN odbywa się za pomocą argumentów wiersza poleceń (biblioteka "
      "Clap) oraz zmiennych środowiskowych. Program obsługuje dwa podpolecenia: run "
      "(uruchomienie serwera) i doctor (diagnostyka zależności systemowych).")

    add_code(doc,
             read_code("apps/vpn-server/src/main.rs", 17, 61),
             "Konfiguracja CLI serwera VPN (main.rs) — Clap", "4.6")

    # 4.3.2 VpnBackend
    doc.add_heading("4.3.2. Cecha VpnBackend i struktura PeerSpec", level=3)
    p(doc,
      "Kluczowym elementem architektury serwera VPN jest cecha (trait) VpnBackend, "
      "definiująca zunifikowany interfejs dla wszystkich backendów protokołów VPN. "
      "Każdy backend implementuje metody start(), stop(), status(), apply_peers() "
      "i opcjonalnie public_key().")

    add_code(doc,
             read_code("apps/vpn-server/src/vpn/mod.rs", 29, 60),
             "Cecha VpnBackend i struktura PeerSpec (vpn/mod.rs)", "4.7")

    p(doc,
      "Struktura PeerSpec reprezentuje peera pobranego z Control Plane i zawiera "
      "klucz publiczny WireGuard, opcjonalny klucz wstępnie współdzielony (PSK), "
      "dozwolone adresy IP, oraz login i hasło dla OpenVPN/IKEv2. Ta wspólna struktura "
      "pozwala na jednolite przekazywanie konfiguracji do wszystkich backendów.")

    # 4.3.3 WireGuard
    doc.add_heading("4.3.3. Backend WireGuard", level=3)
    p(doc,
      "Backend WireGuard zarządza interfejsem wg0 i konfiguruje go za pomocą narzędzi "
      "wg-quick (uruchomienie) i wg syncconf (aktualizacja peerów bez restartu). "
      "Konfiguracja obejmuje: pulę adresów 10.8.0.1/24 (IPv4) i fd42:42:42::1/64 (IPv6), "
      "MTU 1420 oraz PersistentKeepalive 25 sekund.")

    add_code(doc,
             read_code("apps/vpn-server/src/vpn/wireguard.rs", 255, 343),
             "Zastosowanie peerów WireGuard z użyciem wg syncconf (wireguard.rs)", "4.8")

    p(doc,
      "Metoda apply_peers generuje kompletną konfigurację WireGuard (sekcje [Interface] "
      "i [Peer]) do pliku tymczasowego, ustawia restrykcyjne uprawnienia (0600), "
      "a następnie używa polecenia wg syncconf do atomowej aktualizacji konfiguracji "
      "interfejsu bez konieczności jego restartu. W przypadku niepowodzenia syncconf "
      "następuje fallback do pełnej rekonfiguracji.")

    # 4.3.4 OpenVPN
    doc.add_heading("4.3.4. Backend OpenVPN", level=3)
    p(doc,
      "Backend OpenVPN konfiguruje serwer w trybie server mode z uwierzytelnianiem "
      "przez login/hasło. Hasła przechowywane są w formacie sól:hash (SHA-256) w pliku "
      "/etc/openvpn/secrets.txt, a weryfikacja odbywa się przez zewnętrzny skrypt "
      "verify.sh wywoływany przez mechanizm auth-user-pass-verify.")

    add_code(doc,
             read_code("apps/vpn-server/src/vpn/openvpn.rs", 103, 147),
             "Skrypt weryfikacji haseł i funkcja haszowania (openvpn.rs)", "4.9")

    p(doc,
      "Mechanizm haszowania wykorzystuje 16-bajtowy losowy sól (salt) dla każdego "
      "użytkownika, co zapobiega atakom słownikowym (rainbow table). Skrypt weryfikujący "
      "otrzymuje plik tymczasowy z loginem i hasłem od OpenVPN, odczytuje odpowiedni "
      "wpis z secrets.txt, oblicza hash SHA-256 z solą i porównuje z zapisanym.")

    # 4.3.5 IKEv2
    doc.add_heading("4.3.5. Backend IKEv2/IPsec (strongSwan)", level=3)
    p(doc,
      "Backend IKEv2 zarządza konfiguracją strongSwan i plikiem /etc/ipsec.secrets. "
      "Uwierzytelnianie klientów odbywa się za pomocą EAP-MSCHAPv2 (login i hasło).")

    add_code(doc,
             read_code("apps/vpn-server/src/vpn/ipsec.rs", 88, 136),
             "Zarządzanie sekretami IKEv2/strongSwan (ipsec.rs)", "4.10")

    p(doc,
      "Metoda apply_peers zachowuje istniejącą linię z kluczem prywatnym serwera "
      "(RSA lub ECDSA) i dodaje wpisy EAP dla każdego peera w formacie "
      "'użytkownik : EAP \"hasło\"'. Po zapisaniu pliku z uprawnieniami 0600 "
      "wywoływane jest polecenie swanctl --load-all, które przeładowuje konfigurację "
      "strongSwan bez konieczności restartu usługi.")

    # 4.3.6 PKI
    doc.add_heading("4.3.6. Infrastruktura klucza publicznego (PKI)", level=3)
    p(doc,
      "System vpnVPN generuje własny urząd certyfikacji (CA) i certyfikat serwera "
      "przy pierwszym uruchomieniu węzła VPN. Certyfikaty wykorzystywane są przez "
      "OpenVPN (TLS) i IKEv2 (uwierzytelnianie serwera).")

    add_code(doc,
             read_code("apps/vpn-server/src/pki.rs", 43, 131),
             "Generowanie PKI — ECDSA P-256 (pki.rs)", "4.11")

    p(doc,
      "Funkcja ensure_pki generuje certyfikat CA i certyfikat serwera przy użyciu "
      "algorytmu ECDSA P-256 (PKCS_ECDSA_P256_SHA256). Certyfikat serwera zawiera "
      "publiczny adres IP jako Subject Alternative Name (SAN), co jest wymagane "
      "przez klientów IKEv2. Klucz prywatny CA nie jest zapisywany na dysku — "
      "używany jest wyłącznie do podpisania certyfikatu serwera, po czym jest usuwany "
      "z pamięci. Klucz prywatny serwera opakowywany jest w typ Zeroizing, który "
      "automatycznie zeruje pamięć przy dealokacji.")

    # 4.3.7 NAT
    doc.add_heading("4.3.7. Konfiguracja NAT i przekazywania pakietów", level=3)
    p(doc,
      "Aby klienci VPN mogli korzystać z Internetu, serwer musi skonfigurować "
      "przekazywanie pakietów (IP forwarding) i translację adresów (NAT).")

    add_code(doc,
             read_code("apps/vpn-server/src/main.rs", 100, 165),
             "Konfiguracja NAT i przekazywania IP (main.rs)", "4.12")

    p(doc,
      "Funkcja setup_nat_and_forwarding: (1) włącza przekazywanie IPv4 i IPv6 "
      "przez sysctl; (2) wykrywa domyślny interfejs sieciowy hosta; (3) waliduje "
      "nazwę interfejsu (zapobieganie iniekcji argumentów iptables); (4) konfiguruje "
      "maskaradę NAT (iptables -t nat -A POSTROUTING -o <iface> -j MASQUERADE); "
      "(5) zezwala na ruch VPN→Internet i powrotny w łańcuchu FORWARD.")

    # -----------------------------------------------------------------------
    # 4.4 Desktop Client
    # -----------------------------------------------------------------------
    doc.add_heading("4.4. Desktop Client (Tauri)", level=2)
    p(doc,
      "Aplikacja desktopowa vpnVPN oparta jest na frameworku Tauri 2.9, który łączy "
      "natywny webview systemu operacyjnego z backendem Rust. W przeciwieństwie do "
      "Electron, Tauri nie zawiera silnika przeglądarki, co skutkuje znacząco mniejszym "
      "rozmiarem instalatora (~5 MB vs ~150 MB).")

    doc.add_heading("4.4.1. Architektura GUI/Daemon", level=3)
    p(doc,
      "Kluczową decyzją architektoniczną jest podział na dwa procesy: (1) nieuprzywilejowany "
      "interfejs graficzny (Tauri GUI) renderujący widoki React/Vite, oraz "
      "(2) uprzywilejowany daemon Rust uruchomiony z prawami root/admin, zarządzający "
      "połączeniami VPN na poziomie systemowym.")

    p(doc,
      "Daemon nasłuchuje na gnieździe Unix (/var/run/vpnvpn-daemon.sock w produkcji, "
      "/tmp/vpnvpn-daemon.sock w trybie deweloperskim) i obsługuje żądania JSON-RPC "
      "od GUI. Komunikacja obejmuje polecenia takie jak: connect (nawiązanie połączenia VPN), "
      "disconnect (rozłączenie), status (stan połączenia) i list-configs (dostępne "
      "konfiguracje).")

    add_figure_placeholder(doc, "Aplikacja desktopowa vpnVPN — ekran połączenia", "12")

    doc.add_heading("4.4.2. Wsparcie wieloplatformowe", level=3)
    p(doc,
      "Aplikacja desktopowa budowana jest na trzy platformy: macOS (DMG, x64 i ARM), "
      "Linux (deb, rpm, AppImage) i Windows (MSI, NSIS). Buildy realizowane są "
      "automatycznie przez GitHub Actions z macierzą platformową. Dystrybucja odbywa "
      "się przez GitHub Releases z linkami do pobrania na stronie głównej vpnVPN.")


def chapter_5(doc: Document):
    """Rozdział 5: Integracja, testowanie i wdrożenie"""
    doc.add_heading("5. Integracja, testowanie i wdrożenie", level=1)

    # 5.1 Lokalne środowisko
    doc.add_heading("5.1. Lokalne środowisko deweloperskie", level=2)
    p(doc,
      "Rozwój systemu vpnVPN odbywa się w lokalnym środowisku opartym o Docker Compose, "
      "które uruchamia pełny stos aplikacji: bazę danych PostgreSQL, Control Plane, "
      "aplikację webową i węzeł VPN z testowym klientem. Wszystkie komponenty "
      "komunikują się przez rzeczywiste API HTTP — nie stosuje się mocków.")

    add_code(doc,
             read_code("local/compose.yaml", 1, 60),
             "Konfiguracja Docker Compose — lokalne środowisko (compose.yaml)", "5.1")

    p(doc,
      "Węzeł VPN uruchamiany jest w trybie host network (network_mode: host), co "
      "daje mu dostęp do interfejsu sieciowego hosta — niezbędne do prawidłowego "
      "działania NAT. Kontener wymaga uprawnień NET_ADMIN i dostępu do /dev/net/tun.")

    # 5.2 Testy E2E
    doc.add_heading("5.2. Testy end-to-end", level=2)
    p(doc,
      "Testy E2E weryfikują pełną ścieżkę od uruchomienia infrastruktury do nawiązania "
      "połączenia VPN. Infrastruktura testowa zdefiniowana jest w osobnym pliku "
      "compose-e2e.yaml i obejmuje scenariusze dla wszystkich trzech protokołów VPN.")

    p(doc, "Testowane scenariusze obejmują:")
    p(doc, "- Połączenie WireGuard — uruchomienie klienta z wg-quick, ping do serwera (10.8.0.1),")
    p(doc, "- Połączenie OpenVPN — uwierzytelnienie login/hasło, weryfikacja tunelu,")
    p(doc, "- Połączenie IKEv2 — uwierzytelnienie EAP-MSCHAPv2, weryfikacja tunelu,")
    p(doc, "- Odwołanie peera — weryfikacja, że po odwołaniu peera ruch VPN jest blokowany,")
    p(doc, "- Ponowne połączenie — weryfikacja odporności na przerwy w łączności.")

    p_indent(doc,
      "Testy uruchamiane są automatycznie w ramach pipeline'u CI/CD (GitHub Actions) "
      "przy każdym pushu do repozytorium. Środowisko testowe jest w pełni izolowane "
      "dzięki dedykowanej sieci Docker.")

    p_indent(doc,
      "Kluczową decyzją projektową było zastosowanie rzeczywistych komponentów w testach "
      "zamiast mocków. Klient testowy (vpn-test-client) jest pełnoprawnym kontenerem "
      "z zainstalowanym WireGuard, który zestawia tunel VPN i weryfikuje łączność "
      "przez ping do serwera (10.8.0.1). Takie podejście pozwala wykryć problemy "
      "konfiguracyjne, sieciowe i kryptograficzne, które byłyby niewidoczne "
      "w testach opartych na mockach.")

    p_indent(doc,
      "Dla testów OpenVPN i IKEv2 stosowane są dedykowane kontenery klienckie "
      "z odpowiednimi narzędziami (openvpn, strongswan-swanctl). Każdy scenariusz "
      "testowy obejmuje: (1) oczekiwanie na gotowość serwera VPN (polling /health), "
      "(2) pobranie konfiguracji (klucz publiczny, certyfikaty), (3) zestawienie tunelu, "
      "(4) weryfikację łączności, (5) opcjonalnie — test odwołania peera i weryfikację "
      "utraty łączności.")

    # 5.3 CI/CD
    doc.add_heading("5.3. Ciągła integracja i wdrażanie (CI/CD)", level=2)
    p(doc,
      "System vpnVPN wykorzystuje GitHub Actions jako platformę CI/CD z następującymi "
      "pipeline'ami:")

    add_table(doc,
        ["Pipeline", "Wyzwalacz", "Opis"],
        [
            ["ci.yml", "Push/PR do main/staging", "Linting (Biome), testy jednostkowe, build"],
            ["deploy-backend.yml", "Push do main/staging", "Build obrazu Rust, push do GHCR"],
            ["desktop-build.yml", "Push do main/staging", "Macierzowy build (macOS/Linux/Windows)"],
            ["e2e.yml", "Push do main", "Testy E2E w Docker Compose"],
        ],
        "Pipeline'y CI/CD (GitHub Actions)", "10")

    p_indent(doc,
      "Pipeline ci.yml jest wyzwalany przy każdym push i pull request. Wykonuje "
      "kolejno: (1) instalację zależności (bun install), (2) linting kodu (Biome — "
      "alternatywa dla ESLint i Prettier, zapewniająca jednolity styl kodu), "
      "(3) testy jednostkowe (Vitest dla TypeScript, cargo test dla Rust), (4) build "
      "wszystkich pakietów (Turborepo — równoległy build z cache). Pipeline musi "
      "zakończyć się sukcesem przed możliwością mergowania pull requesta.")

    p_indent(doc,
      "Pipeline deploy-backend.yml odpowiada za budowę obrazu Docker serwera VPN "
      "(wieloetapowy build: Rust 1.88 builder + Debian bookworm-slim runtime) i "
      "publikację do GitHub Container Registry (GHCR). Obraz zawiera binarki "
      "WireGuard-tools, OpenVPN i strongSwan. Pipeline desktop-build.yml buduje "
      "aplikację desktopową na macierzy trzech platform (macOS, Linux, Windows) "
      "i publikuje artefakty jako GitHub Release.")

    # 5.4 Wdrożenie
    doc.add_heading("5.4. Wdrożenie produkcyjne", level=2)
    p(doc,
      "Wdrożenie systemu vpnVPN obejmuje cztery niezależne procesy deploymentu:")

    doc.add_heading("5.4.1. Frontend — Vercel", level=3)
    p(doc,
      "Aplikacja Next.js wdrażana jest na platformie Vercel z automatycznym deployem "
      "z gałęzi main (produkcja: vpnvpn.dev) i staging (staging.vpnvpn.dev). Vercel "
      "zapewnia CDN, automatyczne certyfikaty HTTPS, edge functions i preview deploy "
      "dla każdego pull requesta.")

    doc.add_heading("5.4.2. Control Plane — Railway", level=3)
    p(doc,
      "Control Plane wdrożony jest na platformie Railway jako kontener Docker z "
      "automatycznym deployem z GitHub. Konfiguracja zapisana jest w pliku railway.toml, "
      "który definiuje proces budowy, health check i port nasłuchiwania. Domena "
      "produkcyjna: api.vpnvpn.dev.")

    doc.add_heading("5.4.3. VPN Server — manualne VM", level=3)
    p(doc,
      "Węzły VPN wdrażane są ręcznie na maszynach wirtualnych za pomocą skryptu "
      "setup-vpn-node.sh, który: (1) instaluje Docker, (2) pobiera obraz z GHCR "
      "(ghcr.io/xnetcat/vpnvpn/vpn-server), (3) konfiguruje zmienne środowiskowe "
      "(API_URL, VPN_TOKEN, SERVER_ID), (4) uruchamia kontener z host networking "
      "i uprawnieniami NET_ADMIN. Po uruchomieniu węzeł automatycznie rejestruje się "
      "w Control Plane.")

    doc.add_heading("5.4.4. Desktop Client — GitHub Releases", level=3)
    p(doc,
      "Buildy aplikacji desktopowej generowane są automatycznie przez GitHub Actions "
      "z macierzą platformową (macOS x64/ARM, Linux x64, Windows x64) i publikowane "
      "jako GitHub Releases. Linki do pobrania prezentowane są na stronie głównej "
      "vpnVPN z automatyczną detekcją platformy użytkownika.")

    add_figure_placeholder(doc, "Metryki Prometheus eksportowane przez serwer VPN", "13")


def chapter_6(doc: Document):
    """Rozdział 6: Podsumowanie"""
    doc.add_heading("6. Podsumowanie", level=1)

    doc.add_heading("6.1. Ocena realizacji założeń", level=2)
    p(doc,
      "W ramach niniejszej pracy zaprojektowano i zaimplementowano kompletną platformę "
      "vpnVPN — system SaaS do zarządzania usługą VPN. Platforma składa się z czterech "
      "głównych komponentów: aplikacji webowej (Next.js), warstwy sterującej (Bun/Fastify "
      "z PostgreSQL), serwera VPN (Rust) obsługującego trzy protokoły (WireGuard, OpenVPN, "
      "IKEv2/IPsec) oraz aplikacji desktopowej (Tauri z daemonem Rust).")

    p_indent(doc,
      "Wszystkie założenia funkcjonalne zostały zrealizowane: system umożliwia rejestrację "
      "i logowanie użytkowników (OAuth i magic link), zakup subskrypcji (integracja ze "
      "Stripe z webhookami), zarządzanie urządzeniami VPN, generowanie konfiguracji "
      "dla trzech protokołów, a także administrowanie flotą serwerów VPN.")

    p_indent(doc,
      "Wymagania niefunkcjonalne również zostały spełnione: serwer VPN nie loguje "
      "ruchu sieciowego, przechowywane metadane ograniczone są do minimum (klucze "
      "publiczne, zagregowane liczniki), materiał kryptograficzny chroniony jest "
      "restrykcyjnymi uprawnieniami plików (0600) i zerowany z pamięci po użyciu "
      "(Zeroizing), a architektura umożliwia dodawanie nowych węzłów bez przerw "
      "w działaniu usługi.")

    add_table(doc,
        ["Komponent", "Status", "Kluczowe osiągnięcia"],
        [
            ["Frontend SaaS", "95%", "Stripe, OAuth, dashboard, admin, metryki"],
            ["Control Plane", "100%", "Wszystkie endpointy, walidacja Zod, Railway"],
            ["VPN Server", "90%", "WireGuard, OpenVPN, IKEv2, PKI, metryki Prometheus"],
            ["Desktop Client", "85%", "macOS, Linux, Windows, daemon IPC"],
            ["CI/CD", "100%", "GitHub Actions, automatyczny deploy, testy E2E"],
        ],
        "Status realizacji komponentów vpnVPN", "11")

    doc.add_heading("6.2. Ograniczenia", level=2)
    p(doc,
      "Zidentyfikowane ograniczenia systemu obejmują:")

    p(doc,
      "- Ręczne wdrażanie węzłów VPN — proces provisioningu wymaga ręcznego "
      "uruchomienia skryptu na maszynie wirtualnej. Automatyzacja tego procesu "
      "(np. integracja z Terraform/Pulumi) jest zaplanowana, ale nie została "
      "zrealizowana w ramach pracy.")

    p(doc,
      "- Brak klientów mobilnych — system posiada klientów web i desktop, ale "
      "nie oferuje dedykowanej aplikacji mobilnej (iOS/Android). Użytkownicy mobilni "
      "mogą korzystać z natywnego IKEv2 lub klientów WireGuard/OpenVPN.")

    p(doc,
      "- Zależność od zewnętrznych usług — platforma zależy od Vercel (frontend), "
      "Railway (Control Plane), Stripe (płatności) i Neon (baza danych), co "
      "wprowadza ryzyko vendor lock-in.")

    p(doc,
      "- Brak wsparcia proxy — planowana funkcjonalność SOCKS5/HTTP proxy "
      "do obejścia blokad DPI nie została zaimplementowana.")

    doc.add_heading("6.3. Kierunki dalszego rozwoju", level=2)
    p(doc,
      "Zidentyfikowane kierunki dalszego rozwoju obejmują:")

    p(doc,
      "- Klienci mobilni — natywne aplikacje iOS i Android z obsługą WireGuard "
      "i IKEv2, zintegrowane z systemem subskrypcji.")

    p(doc,
      "- Automatyczne wdrażanie węzłów — integracja z Terraform lub Pulumi "
      "umożliwiająca dodawanie nowych węzłów VPN bezpośrednio z panelu administratora.")

    p(doc,
      "- Split tunneling — selektywne kierowanie ruchu przez VPN (np. tylko "
      "określone domeny lub aplikacje).")

    p(doc,
      "- Wsparcie proxy SOCKS5/HTTP — tunelowanie ruchu TCP przez proxy, "
      "umożliwiające obejście blokad DPI.")

    p(doc,
      "- Publiczny dashboard metryk — weryfikowalny, publicznie dostępny "
      "dashboard prezentujący zagregowane metryki systemu, zwiększający "
      "transparentność usługi.")

    p(doc,
      "- Auto-update aplikacji desktopowej — mechanizm automatycznej aktualizacji "
      "w oparciu o Tauri Updater i GitHub Releases.")


def add_bibliography(doc: Document):
    """Add bibliography."""
    doc.add_heading("Bibliografia", level=1)

    refs = [
        '[1] J. A. Donenfeld, "WireGuard: Next Generation Kernel Network Tunnel", '
        'Proceedings of the 2017 Network and Distributed System Security Symposium (NDSS), 2017.',

        '[2] RFC 7296 \u2014 C. Kaufman, P. Hoffman, Y. Nir, P. Eronen, T. Kivinen, '
        '"Internet Key Exchange Protocol Version 2 (IKEv2)", Internet Engineering Task Force, 2014.',

        '[3] RFC 4555 \u2014 P. Eronen, "IKEv2 Mobility and Multihoming Protocol (MOBIKE)", '
        'Internet Engineering Task Force, 2006.',

        '[4] OpenVPN Technologies, "OpenVPN \u2014 Open Source VPN", https://openvpn.net/, '
        'dost\u0119p: 2025.',

        '[5] strongSwan Project, "strongSwan \u2014 the OpenSource IPsec-based VPN Solution", '
        'https://www.strongswan.org/, dost\u0119p: 2025.',

        '[6] Next.js, "The React Framework for the Web", Vercel Inc., '
        'https://nextjs.org/docs, dost\u0119p: 2025.',

        '[7] Tauri Contributors, "Tauri \u2014 Build smaller, faster, and more secure desktop '
        'and mobile applications", https://tauri.app/, dost\u0119p: 2025.',

        '[8] The Rust Programming Language, "The Rust Programming Language", '
        'https://doc.rust-lang.org/book/, dost\u0119p: 2025.',

        '[9] Tokio Contributors, "Tokio \u2014 An asynchronous runtime for the Rust programming '
        'language", https://tokio.rs/, dost\u0119p: 2025.',

        '[10] Prisma, "Prisma \u2014 Next-generation ORM for Node.js and TypeScript", '
        'https://www.prisma.io/docs, dost\u0119p: 2025.',

        '[11] Stripe, "Stripe Documentation \u2014 Subscriptions", '
        'https://stripe.com/docs/billing/subscriptions, dost\u0119p: 2025.',

        '[12] T. Perrin, "The Noise Protocol Framework", noiseprotocol.org, 2018.',

        '[13] D. J. Bernstein, "ChaCha, a variant of Salsa20", Workshop Record of SASC, 2008.',

        '[14] N. Sullivan, "A Primer on Elliptic Curve Cryptography", '
        'Cloudflare Blog, 2013.',

        '[15] GlobalData, "VPN Market Size, Share, Trends, Analysis Report", '
        'GlobalData Plc, 2023.',

        '[16] A. Cuthbertson, "The Rise of VPN Usage: Global Trends and Implications", '
        'Journal of Cybersecurity, vol. 8, no. 1, 2022.',

        '[17] Rozporz\u0105dzenie Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia '
        '27 kwietnia 2016 r. w sprawie ochrony os\u00f3b fizycznych w zwi\u0105zku z przetwarzaniem '
        'danych osobowych (RODO/GDPR).',

        '[18] Fastify Contributors, "Fastify \u2014 Fast and low overhead web framework for Node.js", '
        'https://fastify.dev/, dost\u0119p: 2025.',

        '[19] Bun, "Bun \u2014 JavaScript runtime, bundler, transpiler, package manager", '
        'https://bun.sh/, dost\u0119p: 2025.',

        '[20] Railway, "Railway \u2014 Infrastructure Platform", '
        'https://railway.app/docs, dost\u0119p: 2025.',
    ]

    for ref in refs:
        para = doc.add_paragraph(ref, style="Normal")
        para.paragraph_format.first_line_indent = Cm(-1.25)
        para.paragraph_format.left_indent = Cm(1.25)
        para.paragraph_format.space_after = Pt(4)


# ===========================================================================
# MAIN
# ===========================================================================

def main():
    print("Generowanie pracy licencjackiej...")

    # Create main body document
    doc = Document()
    setup_styles(doc)
    setup_page(doc)
    add_page_numbers(doc)

    # Table of contents
    add_toc(doc)

    # Chapters
    chapter_1(doc)
    doc.add_page_break()
    chapter_2(doc)
    doc.add_page_break()
    chapter_3(doc)
    doc.add_page_break()
    chapter_4(doc)
    doc.add_page_break()
    chapter_5(doc)
    doc.add_page_break()
    chapter_6(doc)
    doc.add_page_break()
    add_bibliography(doc)

    # Save the body with correct styles as the master
    doc.save(str(OUTPUT_FILE))
    print(f"  Zapisano treść: {OUTPUT_FILE}")

    # Merge: body as master, title page content prepended
    if TITLE_PAGE.exists():
        print(f"  Scalanie ze stroną tytułową: {TITLE_PAGE}")
        # Re-open the saved body as master (preserving its styles)
        master = Document(str(OUTPUT_FILE))
        title_doc = Document(str(TITLE_PAGE))

        # Copy title page paragraphs to the beginning of master
        # We insert before the first paragraph
        body_element = master.element.body
        first_para = body_element[0]  # first child of body

        # Copy title page content and add a page break
        for i, para in enumerate(title_doc.paragraphs):
            new_p = parse_xml(para._p.xml)
            body_element.insert(i, new_p)

        # Add page break after title page
        from docx.oxml import OxmlElement
        br_para = OxmlElement('w:p')
        br_run = OxmlElement('w:r')
        br = OxmlElement('w:br')
        br.set(qn('w:type'), 'page')
        br_run.append(br)
        br_para.append(br_run)
        body_element.insert(len(title_doc.paragraphs), br_para)

        master.save(str(OUTPUT_FILE))
        print(f"  Zapisano kompletny dokument: {OUTPUT_FILE}")
    else:
        print(f"  UWAGA: Brak strony tytułowej ({TITLE_PAGE}), zapisano samą treść.")

    print("Gotowe!")


if __name__ == "__main__":
    main()
