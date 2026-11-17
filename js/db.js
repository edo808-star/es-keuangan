/* ES Keuangan — lapisan penyimpanan IndexedDB
 * Store:
 *   kategori  : { id, nama, jenis: 'masuk' | 'keluar' }
 *   transaksi : { id, tanggal: 'YYYY-MM-DD', jenis, kategori (id kategori), jumlah (angka bulat), catatan, dibuat_pada (ISO) }
 *   meta      : { key, value }  — mis. lastBackup, mulai, snoozeBackup
 */
(function () {
  'use strict';

  const DB_NAME = 'es-keuangan';
  const DB_VERSION = 1;

  const KATEGORI_DEFAULT = [
    { nama: 'Gaji', jenis: 'masuk' },
    { nama: 'Penjualan', jenis: 'masuk' },
    { nama: 'Bonus', jenis: 'masuk' },
    { nama: 'Lainnya', jenis: 'masuk' },
    { nama: 'Makan', jenis: 'keluar' },
    { nama: 'Transport', jenis: 'keluar' },
    { nama: 'Belanja', jenis: 'keluar' },
    { nama: 'Tagihan', jenis: 'keluar' },
    { nama: 'Lainnya', jenis: 'keluar' }
  ];

  function buatId(prefix) {
    if (window.crypto && typeof crypto.randomUUID === 'function') return prefix + '_' + crypto.randomUUID();
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  let dbPromise = null;

  function buka() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Browser ini tidak mendukung IndexedDB.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kategori')) {
          db.createObjectStore('kategori', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('transaksi')) {
          const tx = db.createObjectStore('transaksi', { keyPath: 'id' });
          tx.createIndex('tanggal', 'tanggal');
          tx.createIndex('kategori', 'kategori');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        // Isi kategori default saat database pertama kali dibuat
        if (e.oldVersion === 0) {
          const t = req.transaction;
          const ks = t.objectStore('kategori');
          KATEGORI_DEFAULT.forEach((k) => ks.put({ id: buatId('kat'), nama: k.nama, jenis: k.jenis }));
          t.objectStore('meta').put({ key: 'mulai', value: new Date().toISOString() });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database sedang dipakai di tab lain. Tutup tab lain lalu coba lagi.'));
    });
    return dbPromise;
  }

  function reqKePromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function selesai(t) {
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaksi database dibatalkan.'));
    });
  }

  async function semua(store) {
    const db = await buka();
    return reqKePromise(db.transaction(store, 'readonly').objectStore(store).getAll());
  }

  async function simpan(store, obj) {
    const db = await buka();
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(obj);
    await selesai(t);
    return obj;
  }

  async function hapus(store, id) {
    const db = await buka();
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(id);
    await selesai(t);
  }

  async function getMeta(key) {
    const db = await buka();
    const r = await reqKePromise(db.transaction('meta', 'readonly').objectStore('meta').get(key));
    return r ? r.value : undefined;
  }

  async function setMeta(key, value) {
    return simpan('meta', { key, value });
  }

  /** Hapus kategori; jika pindahKe diisi, transaksi dengan kategori ini dipindah dulu. */
  async function hapusKategori(id, pindahKe) {
    const db = await buka();
    const t = db.transaction(['kategori', 'transaksi'], 'readwrite');
    const ts = t.objectStore('transaksi');
    if (pindahKe) {
      const req = ts.index('kategori').openCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          const v = c.value;
          v.kategori = pindahKe;
          c.update(v);
          c.continue();
        }
      };
    }
    t.objectStore('kategori').delete(id);
    await selesai(t);
  }

  /** Impor data backup. mode: 'ganti' (hapus semua dulu) atau 'gabung'. */
  async function impor(data, mode) {
    const db = await buka();
    const t = db.transaction(['kategori', 'transaksi'], 'readwrite');
    const ks = t.objectStore('kategori');
    const ts = t.objectStore('transaksi');
    if (mode === 'ganti') {
      ks.clear();
      ts.clear();
    }
    data.kategori.forEach((k) => ks.put(k));
    data.transaksi.forEach((x) => ts.put(x));
    await selesai(t);
  }

  window.DB = {
    buka, semua, simpan, hapus, getMeta, setMeta, hapusKategori, impor, buatId,
    KATEGORI_DEFAULT
  };
})();
