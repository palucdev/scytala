import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/logout/route";
import * as sessionModule from "@/lib/session";
import { Logger } from "@/lib/logger";

const mockCookieSet = vi.fn();
const mockCookieDelete = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: mockCookieSet,
    delete: mockCookieDelete,
    get: mockCookieGet,
  })),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCookieSet.mockReset();
    mockCookieDelete.mockReset();
    mockCookieGet.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("handles form-data submission with dashboardHash and redirectTo", async () => {
    const formData = new FormData();
    formData.append("dashboardHash", "AbCdEfGh12345678");
    formData.append("redirectTo", "/custom-redirect");

    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/custom-redirect",
    );

    const expectedDeleteOptions = sessionModule.getDeleteSessionCookieOptions();
    expect(mockCookieSet).toHaveBeenCalledWith(
      sessionModule.getSessionCookieName("AbCdEfGh12345678"),
      "",
      expectedDeleteOptions,
    );
    expect(mockCookieSet).toHaveBeenCalledWith(
      sessionModule.getSessionCookieName(),
      "",
      expectedDeleteOptions,
    );
  });

  it("handles form-data submission with only dashboardHash and redirects to dashboard login", async () => {
    const formData = new FormData();
    formData.append("dashboardHash", "TestHash12345678");

    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard/TestHash12345678",
    );

    const expectedDeleteOptions = sessionModule.getDeleteSessionCookieOptions();
    expect(mockCookieSet).toHaveBeenCalledWith(
      sessionModule.getSessionCookieName("TestHash12345678"),
      "",
      expectedDeleteOptions,
    );
    expect(mockCookieSet).toHaveBeenCalledWith(
      sessionModule.getSessionCookieName(),
      "",
      expectedDeleteOptions,
    );
  });

  it("handles form-data submission without parameters and redirects to root", async () => {
    const formData = new FormData();

    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");

    const expectedDeleteOptions = sessionModule.getDeleteSessionCookieOptions();
    expect(mockCookieSet).toHaveBeenCalledWith(
      sessionModule.getSessionCookieName(),
      "",
      expectedDeleteOptions,
    );
  });

  it("handles urlencoded form-data submission", async () => {
    const body = new URLSearchParams({
      dashboardHash: "UrlEncodedHash123",
      redirectTo: "/dashboard/UrlEncodedHash123",
    }).toString();

    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard/UrlEncodedHash123",
    );

    expect(mockCookieSet).toHaveBeenCalledWith(
      sessionModule.getSessionCookieName("UrlEncodedHash123"),
      "",
      sessionModule.getDeleteSessionCookieOptions(),
    );
  });

  it("handles JSON payload submission", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        dashboardHash: "JsonHash12345678",
        redirectTo: "/dashboard/JsonHash12345678",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard/JsonHash12345678",
    );

    expect(mockCookieSet).toHaveBeenCalledWith(
      sessionModule.getSessionCookieName("JsonHash12345678"),
      "",
      sessionModule.getDeleteSessionCookieOptions(),
    );
  });

  it("handles malformed JSON payload gracefully", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "invalid-json{",
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(mockCookieSet).toHaveBeenCalledWith(
      sessionModule.getSessionCookieName(),
      "",
      sessionModule.getDeleteSessionCookieOptions(),
    );
  });

  it("prevents open redirect attacks via absolute external URLs", async () => {
    const formData = new FormData();
    formData.append("dashboardHash", "SecHash123");
    formData.append("redirectTo", "https://evil.com/phishing");

    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard/SecHash123",
    );
  });

  it("prevents protocol-relative open redirect attacks", async () => {
    const formData = new FormData();
    formData.append("redirectTo", "//evil.com/phishing");

    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("prevents backslash open redirect attacks", async () => {
    const formData = new FormData();
    formData.append("redirectTo", "/\\evil.com/phishing");

    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("catches unhandled exceptions and redirects to root", async () => {
    mockCookieSet.mockImplementation(() => {
      throw new Error("Cookie header serialization failure");
    });

    const errorSpy = vi.spyOn(Logger.prototype, "error");

    const request = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ dashboardHash: "HashFail" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(errorSpy).toHaveBeenCalledWith(
      "POST /api/auth/logout failed",
      expect.any(Error),
    );
  });

  it("evicts cookies with secure flag in production environment", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const formData = new FormData();
    formData.append("dashboardHash", "ProdHash123");

    const request = new NextRequest("https://scytala.app/api/auth/logout", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://scytala.app/dashboard/ProdHash123",
    );

    const deleteOptions = sessionModule.getDeleteSessionCookieOptions();
    expect(deleteOptions.secure).toBe(true);
    expect(deleteOptions.maxAge).toBe(0);
    expect(deleteOptions.path).toBe("/");
    expect(deleteOptions.httpOnly).toBe(true);

    expect(mockCookieSet).toHaveBeenCalledWith(
      "__Host-scytala_session_ProdHash123",
      "",
      deleteOptions,
    );
    expect(mockCookieSet).toHaveBeenCalledWith(
      "__Host-scytala_session",
      "",
      deleteOptions,
    );
  });
});
