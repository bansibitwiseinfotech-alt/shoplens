
export async function getDashboardOverview({
  from,
  to,
  datePreset = "last30",
} = {}) {
  const params = new URLSearchParams({ datePreset });

  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const response = await fetch(
    `/api/dashboard/overview?${params.toString()}`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success !== true) {
    throw new Error(
      result.message || `Dashboard request failed (${response.status}).`
    );
  }

  return result.data;
}

export default { getDashboardOverview };
