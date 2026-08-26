import { ImageResponse } from "next/og";

export const alt = "Verdict: Bugs are innocent until reproduced.";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#0C0805",
          color: "#F6F1EB",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          padding: "64px",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "2px solid #51473E",
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "52px",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: "18px" }}>
            <div
              style={{
                alignItems: "center",
                border: "3px solid #F4A437",
                color: "#F4A437",
                display: "flex",
                fontSize: "31px",
                height: "52px",
                justifyContent: "center",
                width: "52px",
              }}
            >
              V
            </div>
            <div style={{ fontSize: "34px", fontWeight: 700 }}>Verdict</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ color: "#F4A437", fontSize: "22px", letterSpacing: "0.12em" }}>
              EVIDENCE-FIRST BUG REPRODUCTION
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: "72px", fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1 }}>
              <span>Bugs are innocent</span>
              <span>until reproduced.</span>
            </div>
          </div>
          <div style={{ color: "#B6AA9B", display: "flex", fontSize: "22px", justifyContent: "space-between" }}>
            <span>Hunter / Surgeon / Insurance</span>
            <span>Public writes require approval</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
