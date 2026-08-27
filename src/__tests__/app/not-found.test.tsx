import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import NotFound from "@/app/not-found";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

describe("404 Not Found Page (src/app/not-found.tsx)", () => {
  function renderNotFound() {
    return render(
      <ThemeProvider theme={PapyrusThemeLight}>
        <NotFound />
      </ThemeProvider>,
    );
  }

  it("renders 404 heading and description with Papyrus theme", () => {
    renderNotFound();

    expect(
      screen.getByRole("heading", { name: /404 — page not found/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /the requested page or dashboard could not be found/i,
      ),
    ).toBeInTheDocument();
  });

  it("provides navigation CTAs for creating a new dashboard and returning home", () => {
    renderNotFound();

    const createBtn = screen.getByRole("link", {
      name: /create new dashboard/i,
    });
    expect(createBtn).toBeInTheDocument();
    expect(createBtn).toHaveAttribute("href", "/new");

    const returnHomeBtn = screen.getByRole("link", {
      name: /return home/i,
    });
    expect(returnHomeBtn).toBeInTheDocument();
    expect(returnHomeBtn).toHaveAttribute("href", "/");
  });
});
