import { ImageResponse } from "next/og";

export const runtime = "edge";
// Apple touch icon is 180x180. iOS will scale for splash screens.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111",
          color: "white",
          fontSize: 120,
          fontWeight: 500,
          letterSpacing: "-0.04em",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        N
      </div>
    ),
    { ...size }
  );
}
