import { previewResponse } from "@/lib/preview";

/** "Preview as a visitor": sets the country cookie and opens the site's page (see previewResponse). */
export function GET(request: Request) {
  return previewResponse(request);
}
