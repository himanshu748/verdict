import { renderDemoReport } from "@/lib/demo-case";

export function GET() {
  return new Response(renderDemoReport(), {
    headers: {
      "Content-Disposition": 'attachment; filename="VERDICT.md"',
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
