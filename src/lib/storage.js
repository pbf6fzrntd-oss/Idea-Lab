// Swap this for a real backend (DB, file, KV store) whenever you're ready —
// it's the only place session persistence lives.
const PREFIX = "idea-lab:";

export const storage = {
  async get(key) {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? null : { key, value: v };
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true };
  },
};
