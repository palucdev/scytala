# E2E Testing Rules

- Use `getByRole`, `getByLabel`, `getByText` as primary locators. Fall back to `getByTestId` or ID selectors only when accessibility attributes are ambiguous.
- Never use fragile CSS selectors, XPath, or arbitrary DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use `page.waitForTimeout()`. Wait for specific conditions: `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., timestamp suffix) for test data to avoid collisions in parallel runs.
- Internal boundaries (auth, routing, DB) stay real — that's where integration risk hides.
