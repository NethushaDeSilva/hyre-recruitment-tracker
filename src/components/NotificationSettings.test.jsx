import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NotificationSettings from "./NotificationSettings";
import { desktopEnabled, setDesktopEnabled, showDesktopNotification } from "@/lib/desktopNotifications";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "hr", role: "HR" } }) }));
let storage, Popup;
beforeEach(() => {
  storage = new Map();
  Popup = vi.fn(function () { this.close = vi.fn(); });
  Popup.permission = "default";
  Popup.requestPermission = vi.fn(async () => { Popup.permission = "granted"; return "granted"; });
  vi.stubGlobal("Notification", Popup);
  vi.stubGlobal("window", { isSecureContext: true, Notification: Popup, dispatchEvent: vi.fn(), focus: vi.fn() });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("localStorage", { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());
it("asks permission only on opt-in, and supports turning pop-ups off", async () => {
  let tree;
  await act(async () => { tree = create(<NotificationSettings />); });
  expect(Popup.requestPermission).not.toHaveBeenCalled();
  await act(async () => { await tree.root.findByType("button").props.onClick(); });
  expect(desktopEnabled("hr")).toBe(true);
  await act(async () => { await tree.root.findByType("button").props.onClick(); });
  expect(desktopEnabled("hr")).toBe(false);
  expect(Popup.requestPermission).toHaveBeenCalledTimes(1);
  tree.unmount();
});
it("keeps the inbox available when browser permission is denied", async () => {
  Popup.permission = "denied";
  let tree;
  await act(async () => { tree = create(<NotificationSettings />); });
  expect(tree.root.findByType("button").props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain("Your bell inbox is always on.");
  tree.unmount();
});
it("requires both opt-in and permission, isolates accounts and deduplicates pop-ups", async () => {
  const note = { id: "one", title: "Interview assignment" };
  await showDesktopNotification("hr", note, "Details", vi.fn());
  expect(Popup).not.toHaveBeenCalled();
  setDesktopEnabled("hr", true);
  await showDesktopNotification("hr", note, "Details", vi.fn());
  expect(Popup).not.toHaveBeenCalled();
  Popup.permission = "granted";
  await showDesktopNotification("other-user", note, "Details", vi.fn());
  expect(Popup).not.toHaveBeenCalled();
  await showDesktopNotification("hr", note, "Details", vi.fn());
  await showDesktopNotification("hr", note, "Details", vi.fn());
  expect(Popup).toHaveBeenCalledTimes(1);
});
