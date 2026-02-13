const PptxGenJS = require("pptxgenjs");

// 1. Setup Presentation
const pres = new PptxGenJS();
pres.layout = "LAYOUT_16x9";

// Meta Data
pres.title = "Projekt i implementacja platformy SaaS VPN";
pres.author = "Student Inżynier";
pres.company = "Politechnika";

// --- THEME CONFIGURATION ---
const THEME = {
  bg: "0F172A", // Deep Slate Blue
  bgDark: "020617", // Very dark slate
  text: "F1F5F9", // Off-white
  accent: "38BDF8", // Sky Blue
  accentDark: "0369A1", // Darker blue for borders
  success: "4ADE80", // Green
  successDark: "166534", // Dark Green for borders
  secondary: "94A3B8", // Grey
  boxFill: "1E293B", // Lighter Slate
  border: "334155", // Subtle border
};

const FONTS = {
  head: "Verdana",
  body: "Arial",
  mono: "Courier New",
};

// Define a Master Slide for consistent layout
pres.defineSlideMaster({
  title: "MASTER_SLIDE",
  background: { color: THEME.bg },
  objects: [
    // Top accent line
    {
      rect: {
        x: 0,
        y: 0,
        w: "100%",
        h: 0.05,
        fill: { color: THEME.accent },
      },
    },
    // Page Number
    {
      placeholder: {
        options: {
          name: "slideNumber",
          type: "slideNumber",
          x: 9.0,
          y: 5.2,
          w: 0.8,
          h: 0.3,
          color: THEME.secondary,
          fontSize: 10,
          fontFace: FONTS.body,
          align: "right",
        },
        text: "",
      },
    },
  ],
});

// Helper function to add a title
function addTitle(slide, text, subtext = "") {
  slide.addText(text, {
    x: 0.5,
    y: 0.3,
    w: 12.3,
    fontSize: 30,
    fontFace: FONTS.head,
    color: THEME.accent,
    bold: true,
  });
  if (subtext) {
    slide.addText(subtext, {
      x: 0.5,
      y: 0.8,
      w: 12.3,
      fontSize: 14,
      fontFace: FONTS.body,
      color: THEME.secondary,
    });
  }
  // Divider line
  slide.addShape(pres.ShapeType.line, {
    x: 0.5,
    y: subtext ? 1.25 : 0.9,
    w: 12.3,
    h: 0,
    line: { color: THEME.border, width: 1 },
  });
}

// --- SLIDE 1: INTRO ---
let slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
slide.addShape(pres.ShapeType.roundRect, {
  x: 1.5,
  y: 2.0,
  w: 10.3,
  h: 3.5,
  fill: { color: THEME.bgDark },
  line: { color: THEME.accent, width: 2 },
});
slide.addText("Projekt i implementacja", {
  x: 1.5,
  y: 2.3,
  w: 10.3,
  fontSize: 20,
  color: THEME.success,
  align: "center",
  fontFace: FONTS.body,
});
slide.addText("Platforma SaaS do zarządzania infrastrukturą VPN", {
  x: 1.5,
  y: 2.9,
  w: 10.3,
  fontSize: 42,
  color: THEME.text,
  bold: true,
  align: "center",
  fontFace: FONTS.head,
});
slide.addText("z naciskiem na prywatność użytkowników", {
  x: 1.5,
  y: 4.4,
  w: 10.3,
  fontSize: 24,
  color: THEME.secondary,
  align: "center",
  fontFace: FONTS.body,
});
slide.addText("Autor: [Twoje Imię] | Politechnika", {
  x: 0,
  y: 6.8,
  w: "100%",
  fontSize: 16,
  color: THEME.secondary,
  align: "center",
  fontFace: FONTS.body,
});

// --- SLIDE 2: GOALS ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
addTitle(slide, "Wprowadzenie i Cel Pracy");

// Left Column: Cel
slide.addShape(pres.ShapeType.roundRect, {
  x: 0.5,
  y: 1.7,
  w: 6.0,
  h: 5.3,
  fill: { color: THEME.boxFill },
  line: { color: THEME.border, width: 1 },
});
slide.addText("Cel Pracy", {
  x: 0.8,
  y: 2.0,
  w: 5.4,
  fontSize: 22,
  color: THEME.success,
  bold: true,
  fontFace: FONTS.head,
});
slide.addText(
  [
    {
      text: "• Projekt kompletnego systemu VPN typu SaaS",
      options: { breakLine: true },
    },
    {
      text: "• Centralne zarządzanie flotą serwerów",
      options: { breakLine: true },
    },
    {
      text: "• Ochrona prywatności (No-Logs Architecture)",
      options: { breakLine: true },
    },
    {
      text: "• Wsparcie protokołów: WireGuard, OpenVPN, IKEv2",
      options: { breakLine: true },
    },
  ],
  {
    x: 0.8,
    y: 2.7,
    w: 5.4,
    fontSize: 18,
    color: THEME.text,
    paraSpaceAfter: 15,
    fontFace: FONTS.body,
  }
);

// Right Column: Motywacja
slide.addShape(pres.ShapeType.roundRect, {
  x: 6.8,
  y: 1.7,
  w: 6.0,
  h: 5.3,
  fill: { color: THEME.boxFill },
  line: { color: THEME.accent, width: 2 },
});
slide.addText("Motywacja", {
  x: 7.1,
  y: 2.0,
  w: 5.4,
  fontSize: 22,
  color: THEME.accent,
  bold: true,
  fontFace: FONTS.head,
});
slide.addText(
  [
    {
      text: "• Dynamiczny wzrost rynku VPN ($45 mld do 2027)",
      options: { breakLine: true },
    },
    {
      text: "• Wzrost świadomości prywatności użytkowników",
      options: { breakLine: true },
    },
    {
      text: "• Potrzeba łatwego w obsłudze panelu zarządzania",
      options: { breakLine: true },
    },
  ],
  {
    x: 7.1,
    y: 2.7,
    w: 5.4,
    fontSize: 18,
    color: THEME.secondary,
    paraSpaceAfter: 15,
    fontFace: FONTS.body,
  }
);

// --- SLIDE 3: ARCHITECTURE ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
addTitle(slide, "Architektura Systemu", "Modularna struktura komponentów");

function drawNode(slide, x, y, title, tech, color) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: x,
    y: y,
    w: 2.8,
    h: 1.5,
    fill: { color: THEME.bgDark },
    line: { color: color, width: 2 },
  });
  slide.addText(title, {
    x: x,
    y: y + 0.2,
    w: 2.8,
    align: "center",
    fontSize: 18,
    color: color,
    bold: true,
    fontFace: FONTS.head,
  });
  slide.addText(tech, {
    x: x,
    y: y + 0.8,
    w: 2.8,
    align: "center",
    fontSize: 14,
    color: THEME.secondary,
    fontFace: FONTS.body,
  });
}

drawNode(slide, 0.5, 2.0, "Frontend", "Next.js 15\nVercel", THEME.accent);
drawNode(
  slide,
  5.25,
  2.0,
  "Control Plane",
  "Bun / Lambda\nPostgreSQL",
  THEME.success
);
drawNode(
  slide,
  10.0,
  2.0,
  "VPN Server",
  "Rust / Tokio\nWireGuard",
  THEME.accent
);
drawNode(
  slide,
  5.25,
  5.0,
  "Desktop Client",
  "Tauri / React\nRust Core",
  THEME.success
);

// Connectors
const lineOpts = { color: THEME.text, width: 2, endArrowType: "triangle" };
slide.addShape(pres.ShapeType.line, {
  x: 3.3,
  y: 2.75,
  w: 1.95,
  h: 0,
  line: lineOpts,
}); // Front -> CP
slide.addShape(pres.ShapeType.line, {
  x: 8.05,
  y: 2.75,
  w: 1.95,
  h: 0,
  line: { ...lineOpts, headArrowType: "triangle" },
}); // CP <-> Server
slide.addShape(pres.ShapeType.line, {
  x: 6.65,
  y: 3.5,
  w: 0,
  h: 1.5,
  line: { ...lineOpts, dashType: "dash" },
}); // CP <-> Desktop

slide.addText("gRPC / REST", {
  x: 6.8,
  y: 4.0,
  fontSize: 12,
  color: THEME.secondary,
  fontFace: FONTS.mono,
});
slide.addText("Encrypted Tunnel", {
  x: 10.0,
  y: 4.0,
  fontSize: 14,
  color: THEME.accent,
  bold: true,
  rotate: -45,
});
slide.addShape(pres.ShapeType.line, {
  x: 10.0,
  y: 5.5,
  w: -2.0,
  h: -2.0,
  line: { color: THEME.accent, width: 3, endArrowType: "triangle" },
});

// --- SLIDE 4: TECH STACK 1 ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
addTitle(slide, "Technologie: Web & Cloud");

let tableOpts = {
  x: 0.5,
  y: 1.8,
  w: 6.0,
  fontSize: 14,
  color: THEME.text,
  fill: { color: THEME.boxFill },
  border: { type: "solid", color: THEME.border, pt: 1 },
  margin: 0.1,
};

slide.addTable(
  [
    [
      {
        text: "Frontend (Next.js)",
        options: {
          fill: { color: THEME.accentDark },
          color: THEME.text,
          bold: true,
        },
      },
    ],
    ["• React Server Components (RSC)"],
    ["• tRPC dla bezpieczeństwa typów API"],
    ["• Tailwind CSS & Lucide Icons"],
    ["• Stripe Billing Integration"],
  ],
  tableOpts
);

slide.addTable(
  [
    [
      {
        text: "Backend & Cloud",
        options: {
          fill: { color: THEME.successDark },
          color: THEME.text,
          bold: true,
        },
      },
    ],
    ["• Bun: Modern JS Runtime"],
    ["• AWS Lambda & ECR (Containers)"],
    ["• Neon PostgreSQL (Serverless)"],
    ["• Pulumi (Infrastructure as Code)"],
  ],
  { ...tableOpts, x: 6.8 }
);

// --- SLIDE 5: TECH STACK 2 ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
addTitle(slide, "Technologie: Systemowe");

const sysBoxOpts = {
  y: 1.8,
  w: 6.0,
  h: 5.0,
  fill: { color: THEME.boxFill },
  line: { color: THEME.border, width: 1 },
};

slide.addShape(pres.ShapeType.roundRect, {
  ...sysBoxOpts,
  x: 0.5,
  line: { color: THEME.success, width: 2 },
});
slide.addText("VPN Server (Rust)", {
  x: 0.8,
  y: 2.1,
  fontSize: 22,
  color: THEME.success,
  bold: true,
});
slide.addText(
  [
    {
      text: "• Rust: Bezpieczeństwo i wydajność",
      options: { breakLine: true },
    },
    {
      text: "• WireGuard: Protokół nowej generacji",
      options: { breakLine: true },
    },
    { text: "• Tokio: Asynchroniczny I/O", options: { breakLine: true } },
    { text: "• Axum: Lekki framework HTTP", options: { breakLine: true } },
  ],
  { x: 0.8, y: 2.8, w: 5.4, fontSize: 18, color: THEME.text }
);

slide.addShape(pres.ShapeType.roundRect, {
  ...sysBoxOpts,
  x: 6.8,
  line: { color: THEME.accent, width: 2 },
});
slide.addText("Desktop Client (Tauri)", {
  x: 7.1,
  y: 2.1,
  fontSize: 22,
  color: THEME.accent,
  bold: true,
});
slide.addText(
  [
    {
      text: "• Tauri: Lekka alternatywa dla Electron",
      options: { breakLine: true },
    },
    {
      text: "• Rust Core: Zarządzanie procesami systemowymi",
      options: { breakLine: true },
    },
    {
      text: "• React GUI: Szybkie i responsywne UI",
      options: { breakLine: true },
    },
    { text: "• IPC: Bezpieczna komunikacja", options: { breakLine: true } },
  ],
  { x: 7.1, y: 2.8, w: 5.4, fontSize: 18, color: THEME.text }
);

// --- SLIDE 6: PROGRESS 1 ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
addTitle(slide, "Status Realizacji", "Podsumowanie kluczowych modułów");

slide.addTable(
  [
    [
      {
        text: "Moduł",
        options: { bold: true, fill: { color: THEME.accentDark } },
      },
      {
        text: "Postęp",
        options: {
          bold: true,
          fill: { color: THEME.accentDark },
          align: "center",
        },
      },
      {
        text: "Zrealizowane Funkcjonalności",
        options: { bold: true, fill: { color: THEME.accentDark } },
      },
    ],
    ["Frontend", "95%", "Dashboard, Stripe, Auth (OAuth/Email), Admin Panel"],
    ["Control Plane", "100%", "API, Baza danych, Zarządzanie sesjami, Billing"],
    ["VPN Server", "90%", "WireGuard sync, Monitoring, Dynamiczne limity"],
    ["Desktop Client", "85%", "Tauri App, Rust Daemon, WireGuard integration"],
  ],
  {
    x: 0.5,
    y: 1.8,
    w: 12.3,
    rowH: 0.8,
    fontSize: 16,
    color: THEME.text,
    fill: { color: THEME.boxFill },
    border: { type: "solid", color: THEME.border, pt: 1 },
    valign: "middle",
  }
);

// --- SLIDE 7: PROGRESS 2 ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
addTitle(slide, "Status Realizacji: Detale");

function drawStatusCard(slide, x, y, title, text, icon = "✅") {
  slide.addShape(pres.ShapeType.roundRect, {
    x,
    y,
    w: 12.3,
    h: 1.4,
    fill: { color: THEME.boxFill },
    line: { color: THEME.border, width: 1 },
  });
  slide.addText(`${icon} ${title}`, {
    x: x + 0.2,
    y: y + 0.2,
    w: 11.9,
    fontSize: 20,
    color: THEME.success,
    bold: true,
  });
  slide.addText(text, {
    x: x + 0.2,
    y: y + 0.7,
    w: 11.9,
    fontSize: 16,
    color: THEME.secondary,
  });
}

drawStatusCard(
  slide,
  0.5,
  1.8,
  "Infrastruktura (100%)",
  "Multi-region deployment (AWS), Pulumi Stacks, ECR/S3 pipelines."
);
drawStatusCard(
  slide,
  0.5,
  3.4,
  "Bezpieczeństwo (95%)",
  "Brak logów PII, Szyfrowanie bazy danych, Bezpieczne API Tokens."
);
drawStatusCard(
  slide,
  0.5,
  5.0,
  "CI/CD (100%)",
  "Automatyczne testy, Cross-compilation (Win/Mac/Lin), Auto-deploy."
);

// --- SLIDE 8: LEARNINGS ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
addTitle(slide, "Wnioski i Czego się nauczyłem?");

const learnings = [
  {
    title: "Programowanie Systemowe",
    text: "Zarządzanie pamięcią w Rust, asynchroniczność (Tokio), FFI.",
  },
  {
    title: "Cloud Native",
    text: "Architektura Serverless, konteneryzacja, IaC (Pulumi).",
  },
  {
    title: "Cybersecurity",
    text: "Protokół WireGuard, kryptografia, zarządzanie tożsamością.",
  },
];

learnings.forEach((l, i) => {
  const y = 1.8 + i * 1.6;
  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.5,
    y,
    w: 12.3,
    h: 1.4,
    fill: { color: THEME.boxFill },
    line: { color: THEME.success, width: 1 },
  });
  slide.addText(l.title, {
    x: 0.7,
    y: y + 0.2,
    fontSize: 20,
    color: THEME.success,
    bold: true,
  });
  slide.addText(l.text, {
    x: 0.7,
    y: y + 0.7,
    fontSize: 16,
    color: THEME.text,
  });
});

// --- SLIDE 9: FUTURE ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
addTitle(slide, "Dalsze Plany Rozwoju");

slide.addShape(pres.ShapeType.roundRect, {
  x: 0.5,
  y: 1.8,
  w: 6.0,
  h: 5.0,
  fill: { color: THEME.bgDark },
  line: { color: THEME.success, width: 2 },
});
slide.addText("Faza Produkcyjna", {
  x: 0.8,
  y: 2.1,
  fontSize: 22,
  color: THEME.success,
  bold: true,
});
slide.addText(
  [
    { text: "• Pełna integracja z Stripe Tax", options: { breakLine: true } },
    { text: "• Optymalizacja kosztów AWS", options: { breakLine: true } },
    { text: "• Audyt bezpieczeństwa kodu", options: { breakLine: true } },
  ],
  {
    x: 0.8,
    y: 2.8,
    w: 5.4,
    fontSize: 18,
    color: THEME.text,
    paraSpaceAfter: 15,
  }
);

slide.addShape(pres.ShapeType.roundRect, {
  x: 6.8,
  y: 1.8,
  w: 6.0,
  h: 5.0,
  fill: { color: THEME.bgDark },
  line: { color: THEME.accent, width: 2 },
});
slide.addText("Nowe Funkcjonalności", {
  x: 7.1,
  y: 2.1,
  fontSize: 22,
  color: THEME.accent,
  bold: true,
});
slide.addText(
  [
    {
      text: "• Rozproszony system DNS (Ad-block)",
      options: { breakLine: true },
    },
    { text: "• Obsługa protokołu ShadowSocks", options: { breakLine: true } },
    { text: "• Aplikacje mobilne (iOS/Android)", options: { breakLine: true } },
  ],
  {
    x: 7.1,
    y: 2.8,
    w: 5.4,
    fontSize: 18,
    color: THEME.text,
    paraSpaceAfter: 15,
  }
);

// --- SLIDE 10: SUMMARY ---
slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
slide.addShape(pres.ShapeType.roundRect, {
  x: 2.5,
  y: 2.0,
  w: 8.3,
  h: 3.5,
  fill: { color: THEME.boxFill },
  line: { color: THEME.accent, width: 2 },
});
slide.addText("Dziękuję za uwagę", {
  x: 2.5,
  y: 2.7,
  w: 8.3,
  fontSize: 48,
  color: THEME.text,
  bold: true,
  align: "center",
  fontFace: FONTS.head,
});
slide.addText("Pytania?", {
  x: 2.5,
  y: 4.2,
  w: 8.3,
  fontSize: 28,
  color: THEME.success,
  align: "center",
  fontFace: FONTS.head,
});

slide.addTable(
  [
    [
      {
        text: "Frontend",
        options: {
          bold: true,
          fill: { color: THEME.accentDark },
          color: THEME.text,
        },
      },
      {
        text: "Backend",
        options: {
          bold: true,
          fill: { color: THEME.accentDark },
          color: THEME.text,
        },
      },
      {
        text: "VPN",
        options: {
          bold: true,
          fill: { color: THEME.accentDark },
          color: THEME.text,
        },
      },
      {
        text: "Desktop",
        options: {
          bold: true,
          fill: { color: THEME.accentDark },
          color: THEME.text,
        },
      },
    ],
    ["Next.js / Stripe", "Bun / Lambda", "Rust / WireGuard", "Tauri / React"],
  ],
  {
    x: 0.5,
    y: 6.2,
    w: 12.3,
    fontSize: 14,
    color: THEME.text,
    align: "center",
    border: { type: "solid", color: THEME.border, pt: 1 },
  }
);

// 4. Save Presentation
pres
  .writeFile({ fileName: "Prezentacja_Inzynierska_VPN.pptx" })
  .then((fileName) => {
    console.log(`Created file: ${fileName}`);
  });
