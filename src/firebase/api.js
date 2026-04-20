import { getAuthToken } from "./core";

async function fetchWithAuth(url, { method = "GET", body, timeoutMs = 30000 } = {}) {
  const token = await getAuthToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";
    return await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseApiResponse(res, defaultError) {
  if (!res.ok) {
    let message = defaultError;
    let bodyPreview = "";
    try {
      const cloned = res.clone();
      const err = await res.json();
      message = err.error || message;
      if (err.detail) message += ` (${err.detail})`;
      if (!err.error) {
        try { bodyPreview = (await cloned.text()).slice(0, 200); } catch {}
      }
    } catch {
      try { bodyPreview = (await res.text()).slice(0, 200); } catch {}
    }
    const suffix = bodyPreview ? ` [HTTP ${res.status}: ${bodyPreview}]` : ` [HTTP ${res.status}]`;
    throw new Error(message + suffix);
  }
  return res.json();
}

export async function parseReport(fileUrl, campus, fileName) {
  const res = await fetchWithAuth("/api/parse-report", {
    method: "POST",
    body: { fileUrl, campus, fileName },
    timeoutMs: 60000,
  });
  return parseApiResponse(res, "Failed to parse report");
}

export async function fetchSchedule(weekOf = null) {
  const url = weekOf ? `/api/get-schedule?weekOf=${weekOf}` : "/api/get-schedule";
  const res = await fetchWithAuth(url);
  return parseApiResponse(res, "Failed to fetch schedule");
}

export async function fetchSpecials(weekOf = null, campus = "Mesa Lab") {
  const params = new URLSearchParams({ campus });
  if (weekOf) params.set("weekOf", weekOf);
  const res = await fetchWithAuth(`/api/get-specials?${params}`);
  if (res.status === 404) return null;
  return parseApiResponse(res, "Failed to fetch specials");
}

export async function fetchEventReport(weekOf = null) {
  const url = weekOf ? `/api/get-event-report?weekOf=${weekOf}` : "/api/get-event-report";
  const res = await fetchWithAuth(url);
  if (res.status === 404) return null;
  return parseApiResponse(res, "Failed to fetch event report");
}

export async function fetchSetupReport(weekOf = null) {
  const url = weekOf ? `/api/get-setup-report?weekOf=${weekOf}` : "/api/get-setup-report";
  const res = await fetchWithAuth(url);
  if (res.status === 404) return null;
  return parseApiResponse(res, "Failed to fetch setup report");
}

export async function fetchSchedulePdf(weekOf = null) {
  const url = weekOf ? `/api/get-schedule-pdf?weekOf=${weekOf}` : "/api/get-schedule-pdf";
  const res = await fetchWithAuth(url);
  if (res.status === 404) return null;
  return parseApiResponse(res, "Failed to fetch schedule PDF");
}
