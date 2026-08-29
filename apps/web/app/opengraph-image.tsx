import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Verdict: Bugs are innocent until reproduced.";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public", "verdict-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0C0805",
          color: "#F6F1EB",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          gap: "56px",
          height: "100%",
          padding: "64px",
          width: "100%",
        }}
      >
        <img
          alt=""
          height={420}
          src={logoSrc}
          style={{ borderRadius: "6px", flexShrink: 0 }}
          width={420}
        />

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            gap: "26px",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              color: "#F4A437",
              fontSize: "21px",
              letterSpacing: "0.12em",
            }}
          >
            REPRODUCTION AGENT FOR FLAKY BUGS
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "62px",
              fontWeight: 700,
              letterSpacing: "-0.045em",
              lineHeight: 1.02,
            }}
          >
            <span>Bugs are innocent</span>
            <span>until reproduced.</span>
          </div>

          <div style={{ color: "#B6AA9B", fontSize: "24px", lineHeight: 1.4 }}>
            Runs your test command until it finds the condition that breaks it.
          </div>

          <div
            style={{
              borderTop: "1px solid #51473E",
              color: "#B6AA9B",
              display: "flex",
              fontSize: "19px",
              gap: "22px",
              paddingTop: "20px",
            }}
          >
            <span>Find it</span>
            <span style={{ color: "#51473E" }}>/</span>
            <span>Narrow it</span>
            <span style={{ color: "#51473E" }}>/</span>
            <span>Keep it fixed</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
