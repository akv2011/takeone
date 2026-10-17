// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudioWorkspace } from "../src/components/StudioWorkspace";
const mocks = vi.hoisted(() => ({
  authenticated: true,
  query: vi.fn(),
  video: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
  useQuery: mocks.query,
}));
vi.mock("../src/lib/useVideoUrl", () => ({ useVideoUrl: mocks.video }));
import { PreviousVersionPlayer } from "../src/components/PreviousVersionPlayer";
beforeEach(() => {
  mocks.authenticated = true;
  mocks.query.mockReset();
  mocks.video.mockReset().mockReturnValue({ url: undefined, refresh: vi.fn() });
});
afterEach(cleanup);

test("workspace keeps editing inputs mounted when switching mobile panels", () => {
  render(
    <StudioWorkspace
      canvas={<video aria-label="Current video" />}
      timeline={<p>Filmstrip</p>}
      inspector={<input aria-label="Edit wording" defaultValue="Original" />}
      versions={<a href="/studio/prior">Saved cut</a>}
      activity={<p>Ready</p>}
    />,
  );
  fireEvent.change(screen.getByLabelText("Edit wording"), {
    target: { value: "Keep this change" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Project" }));
  expect(
    screen
      .getByRole("button", { name: "Project" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.getByLabelText("Project versions").getAttribute("data-active"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
  expect(
    (screen.getByLabelText("Edit wording") as HTMLInputElement).value,
  ).toBe("Keep this change");
  expect(screen.getByLabelText("Video canvas")).toBeTruthy();
  expect(screen.getByLabelText("Video timeline")).toBeTruthy();
});

test("previous version signs only the completed parent and provides recovery navigation", () => {
  mocks.query.mockReturnValue({
    _id: "parent",
    status: "done",
    hasOutput: true,
  });
  mocks.video.mockReturnValue({
    url: "https://example.invalid/signed-parent",
    refresh: vi.fn(),
  });
  render(
    <MemoryRouter>
      <PreviousVersionPlayer jobId="parent" />
    </MemoryRouter>,
  );
  expect(mocks.query.mock.calls[0][1]).toEqual({ jobId: "parent" });
  expect(mocks.video).toHaveBeenCalledWith(
    "parent",
    true,
    undefined,
  );
  expect(
    screen.getByLabelText("Previous completed version").getAttribute("src"),
  ).toBe("https://example.invalid/signed-parent");
  expect(
    screen
      .getByRole("link", { name: "Open previous version" })
      .getAttribute("href"),
  ).toBe("/studio/parent");
});

test("missing parent never asks to sign the pending job", () => {
  mocks.query.mockReturnValue(null);
  render(
    <MemoryRouter>
      <PreviousVersionPlayer jobId="missing" />
    </MemoryRouter>,
  );
  expect(mocks.video).toHaveBeenCalledWith(undefined, undefined, undefined);
  expect(
    screen.getByText("Previous video preview is unavailable."),
  ).toBeTruthy();
});

test("disconnected authentication skips the parent query", () => {
  mocks.authenticated = false;
  render(
    <MemoryRouter>
      <PreviousVersionPlayer jobId="parent" />
    </MemoryRouter>,
  );
  expect(mocks.query.mock.calls[0][1]).toBe("skip");
  expect(mocks.video).toHaveBeenCalledWith(undefined, undefined, undefined);
});
