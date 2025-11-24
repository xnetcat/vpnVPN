export const WEB_URL =
  import.meta.env.VITE_VPNVPN_DESKTOP_URL ??
  "http://localhost:3000/desktop?desktop=1";

export default function App() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        backgroundColor: "#020617",
      }}
    >
      <iframe
        src={WEB_URL}
        title="vpnVPN Desktop"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
        allow="clipboard-write; fullscreen"
      />
    </div>
  );
}
