import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroTitle } from "../components/hero-title";

describe("landing page", () => {
  it("keeps spaces between the visual hero lines for assistive text", () => {
    const markup = renderToStaticMarkup(<HeroTitle />);

    expect(markup).toMatch(
      /<h1><span>Find the exact<\/span> <span>condition that<\/span> <span>makes it fail\.<\/span><\/h1>/,
    );
  });
});
