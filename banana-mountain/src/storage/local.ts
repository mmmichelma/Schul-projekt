/* localStorage kann in manchen Umgebungen fehlen oder Fehler werfen – dann einfach weiterspielen */
export const ls = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* egal */ } },
};
