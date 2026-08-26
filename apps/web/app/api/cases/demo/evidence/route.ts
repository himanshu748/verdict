import { demoCase } from "@/lib/demo-case";

export function GET() {
  return Response.json(demoCase, {
    headers: {
      "Content-Disposition": 'attachment; filename="verdict.json"',
    },
  });
}
