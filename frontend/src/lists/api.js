// R3c — thin fetch wrappers around the /lists endpoints landed in R3b.
//
// The module is shape-only: it receives authedFetch and apiBase via a
// factory so the api module stays decoupled from App.jsx's auth and
// base-URL constants. Use makeListsApi({ authedFetch, apiBase }) once
// inside ListBuilderPage and pass the returned object to handlers.
//
// Every wrapper returns the parsed JSON body on success (status 2xx)
// and throws on anything else. Thrown errors carry .status and .body
// so callers can branch (401 → re-auth, 422 → inline validation, 5xx
// → toast + rollback).

export function makeListsApi({ authedFetch, apiBase }) {
  const request = async (path, init = {}) => {
    const res = await authedFetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    let body = null;
    try { body = await res.json(); } catch { /* tolerate empty body */ }
    if (!res.ok) {
      const err = new Error(body?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = body || null;
      throw err;
    }
    return body;
  };

  return {
    getLists:   ()          => request("/lists"),
    createList: (body)      => request("/lists",            { method: "POST",   body: JSON.stringify(body) }),
    updateList: (id, body)  => request(`/lists/${id}`,      { method: "PATCH",  body: JSON.stringify(body) }),
    deleteList: (id)        => request(`/lists/${id}`,      { method: "DELETE" }),
    getList:    (id)        => request(`/lists/${id}`),
    createItem: (listId, body)         => request(`/lists/${listId}/items`,             { method: "POST",   body: JSON.stringify(body) }),
    updateItem: (listId, itemId, body) => request(`/lists/${listId}/items/${itemId}`,   { method: "PATCH",  body: JSON.stringify(body) }),
    deleteItem: (listId, itemId)       => request(`/lists/${listId}/items/${itemId}`,   { method: "DELETE" }),
  };
}
