// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/lib/convexApi", () => ({ authEnabled: false, convexEnabled: false, api: { generate: { capabilities: "generate:capabilities" } } }));
vi.mock("convex/react", () => ({ useQuery: () => undefined }));

import Header from "../src/components/Header";

afterEach(cleanup);

test("the public header renders without Clerk or Convex configuration", () => {
  render(React.createElement(MemoryRouter, {}, React.createElement(Header)));
  expect(screen.getByRole("link", { name: "TakeOne home" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Start" }).getAttribute("href")).toBe("/create");
  expect(screen.queryByText("Telegram")).toBeNull();
});
