import { createRef } from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { LineNumberGutter } from "@/app/dashboard/[hash]/note/[noteId]/components/LineNumberGutter";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("LineNumberGutter Component", () => {
  it("renders line number '1' for empty content", () => {
    const { container } = renderWithTheme(<LineNumberGutter content="" />);
    const pre = container.querySelector("pre");
    expect(pre).toBeInTheDocument();
    expect(pre).toHaveTextContent("1");
    expect(pre).toHaveAttribute("aria-hidden", "true");
  });

  it("renders line number '1' for single-line content", () => {
    const { container } = renderWithTheme(
      <LineNumberGutter content="Hello world without newlines" />,
    );
    const pre = container.querySelector("pre");
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toBe("1");
  });

  it("renders a single pre element with 1-based newline-joined line numbers (F2)", () => {
    const multilineContent = "line 1\nline 2\nline 3\nline 4\nline 5";
    const { container } = renderWithTheme(
      <LineNumberGutter content={multilineContent} />,
    );

    const preElements = container.querySelectorAll("pre");
    // Must be a single pre element, not multiple Typography elements
    expect(preElements).toHaveLength(1);
    expect(preElements[0].textContent).toBe("1\n2\n3\n4\n5");
  });

  it("has pointer-events: none so mousewheel events pass through to underlying textarea (F10)", () => {
    const { container } = renderWithTheme(
      <LineNumberGutter content="test\nlines" />,
    );
    const pre = container.querySelector("pre");
    expect(pre).toHaveStyle({
      pointerEvents: "none",
      userSelect: "none",
    });
  });

  it("forwards ref to the underlying pre element", () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(<LineNumberGutter ref={ref} content="sample" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe("pre");
  });

  it("respects custom lineHeight and fontSize props", () => {
    const { container } = renderWithTheme(
      <LineNumberGutter
        content="line 1\nline 2"
        lineHeight={2.0}
        fontSize="1rem"
      />,
    );
    const pre = container.querySelector("pre");
    expect(pre).toBeInTheDocument();
  });
});
