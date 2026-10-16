// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Legal from "../src/pages/Legal";

afterEach(cleanup);

test.each([
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/acceptable-use", "Acceptable Use Policy"],
  ["/copyright", "Copyright and Takedowns"],
  ["/refund-policy", "Refund Policy"],
])("%s renders a dated, contactable policy", (path, title) => {
  render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Legal)));
  expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  expect(screen.getByText(/Updated September 22, 2026/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "hello@takeone.web.app" }).getAttribute("href")).toBe("mailto:hello@takeone.web.app");
});
