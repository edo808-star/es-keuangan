/* ES Keuangan — logika aplikasi (JavaScript murni, tanpa framework) */
(function () {
  'use strict';

  const APP_VERSION = '1.7.0';
  const HARI_MS = 24 * 60 * 60 * 1000;
  const BATAS_BACKUP_HARI = 7;
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  const $ = (id) => document.getElementById(id);
  const NAMA_BUKU = { pribadi: 'Pribadi', usaha: 'Usaha' };

  const state = {
    kategori: [],
    transaksi: [],
    bulan: bulanIni(),
    buku: 'pribadi',            // buku aktif: 'pribadi' | 'usaha'
    pengaturan: { namaUsaha: '', waKontak: [], waOtomatis: true, waAksi: 'sekaligus', saldoAwal: { pribadi: 0, usaha: 0 } },
    filterJenis: 'semua',
    filterKategori: '',
    view: 'beranda',
    formJenis: 'keluar'
  };
  let chartKategori = null;
  let chartTren = null;

  /* ============ Utilitas ============ */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hariIni() { return ymd(new Date()); }
  function bulanIni() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function geserBulan(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function labelBulan(ym, pendek) {
    const [y, m] = ym.split('-').map(Number);
    return pendek ? BULAN_PENDEK[m - 1] + ' ' + String(y).slice(2) : BULAN[m - 1] + ' ' + y;
  }
  function titikRibuan(n) { return String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  /** Format Rupiah: Rp 1.250.000 */
  function rupiah(n, tanda) {
    const neg = n < 0;
    let s = 'Rp ' + titikRibuan(n);
    if (neg) s = '-' + s;
    else if (tanda && n > 0) s = '+' + s;
    return s;
  }
  function rupiahSingkat(n) {
    const a = Math.abs(n);
    const f = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
    if (a >= 1e9) return f(n / 1e9) + ' M';
    if (a >= 1e6) return f(n / 1e6) + ' jt';
    if (a >= 1e3) return f(n / 1e3) + ' rb';
    return String(n);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function labelTanggal(s) {
    const d = parseYmd(s);
    const hari = hariIni();
    const kemarin = ymd(new Date(Date.now() - HARI_MS));
    const dasar = HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
    if (s === hari) return 'Hari ini · ' + dasar;
    if (s === kemarin) return 'Kemarin · ' + dasar;
    return dasar;
  }
  function formatWaktu(iso) {
    const d = new Date(iso);
    return d.getDate() + ' ' + BULAN_PENDEK[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + '.' + pad(d.getMinutes());
  }
  function kategoriById(id) { return state.kategori.find((k) => k.id === id); }
  function namaKategori(id) { const k = kategoriById(id); return k ? k.nama : '(Kategori terhapus)'; }
  function urutKategori(list) { return list.slice().sort((a, b) => (a.nama === 'Lainnya') - (b.nama === 'Lainnya') || a.nama.localeCompare(b.nama, 'id')); }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  /* ============ Toast & dialog ============ */
  let toastTimer = null;
  function toast(pesan, aksi) {
    const el = $('toast');
    el.innerHTML = '<span>' + esc(pesan) + '</span>';
    if (aksi) {
      const b = document.createElement('button');
      b.textContent = aksi.label;
      b.onclick = () => { el.hidden = true; aksi.fn(); };
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, aksi ? 6000 : 2600);
  }

  let dialogResolve = null;
  /** Dialog serbaguna. tombol: [{label, nilai, kelas}] → Promise<nilai|null> */
  function dialog(judul, isiHtml, tombol) {
    $('dialogTitle').textContent = judul;
    $('dialogBody').innerHTML = isiHtml;
    const wadah = $('dialogActions');
    wadah.innerHTML = '';
    tombol.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (t.kelas || 'btn-outline');
      b.textContent = t.label;
      b.onclick = () => tutupDialog(t.nilai);
      wadah.appendChild(b);
    });
    $('dialogOverlay').hidden = false;
    const inp = $('dialogBody').querySelector('input,select');
    if (inp) setTimeout(() => inp.focus(), 50);
    return new Promise((res) => { dialogResolve = res; });
  }
  function tutupDialog(nilai) {
    $('dialogOverlay').hidden = true;
    const r = dialogResolve;
    dialogResolve = null;
    if (r) r(nilai === undefined ? null : nilai);
  }
  function konfirmasi(judul, pesan, labelYa, bahaya) {
    return dialog(judul, '<p>' + pesan + '</p>', [
      { label: labelYa || 'Ya', nilai: true, kelas: bahaya ? 'btn-danger' : 'btn-primary' },
      { label: 'Batal', nilai: false, kelas: 'btn-ghost' }
    ]);
  }
  function info(judul, pesan) {
    return dialog(judul, '<p>' + pesan + '</p>', [{ label: 'OK', nilai: true, kelas: 'btn-primary' }]);
  }

  /* ============ Data ============ */
  async function muatData() {
    const [kat, tx] = await Promise.all([DB.semua('kategori'), DB.semua('transaksi')]);
    state.kategori = kat;
    // Transaksi lama (sebelum ada fitur 2 buku) otomatis masuk buku Pribadi
    tx.forEach((t) => { if (t.buku !== 'usaha') t.buku = 'pribadi'; });
    state.transaksi = tx;
    const [peng, bukuAktif] = await Promise.all([DB.getMeta('pengaturan'), DB.getMeta('bukuAktif')]);
    if (peng) state.pengaturan = Object.assign({}, state.pengaturan, peng);
    state.pengaturan.saldoAwal = normalSaldoAwal(state.pengaturan.saldoAwal);
    state.pengaturan.waKontak = normalKontak(state.pengaturan);
    if ('waNomor' in state.pengaturan) {
      // simpan hasil pemindahan nomor lama ke daftar nomor
      delete state.pengaturan.waNomor;
      DB.setMeta('pengaturan', state.pengaturan).catch(() => {});
    }
    if (bukuAktif === 'usaha' || bukuAktif === 'pribadi') state.buku = bukuAktif;
  }

  /** Daftar nomor WhatsApp; nomor tunggal versi lama (waNomor) otomatis dipindah ke daftar */
  function normalKontak(p) {
    let list = Array.isArray(p && p.waKontak) ? p.waKontak : [];
    list = list.filter((k) => k && nomorWa(k.nomor)).map((k) => ({
      id: String(k.id || DB.buatId('wa')), nama: String(k.nama || 'Kontak').slice(0, 30), nomor: String(k.nomor).slice(0, 20)
    }));
    if (!list.length && p && p.waNomor && nomorWa(p.waNomor)) {
      list.push({ id: DB.buatId('wa'), nama: 'Kontak 1', nomor: String(p.waNomor).slice(0, 20) });
    }
    return list;
  }
  function normalSaldoAwal(o) {
    const n = (v) => (isFinite(Number(v)) ? Math.round(Number(v)) : 0);
    return { pribadi: n(o && o.pribadi), usaha: n(o && o.usaha) };
  }
  /** Saldo saat ini sebuah buku = saldo awal + semua pemasukan − semua pengeluaran */
  function saldoBuku(buku) {
    const list = transaksiBuku(buku);
    return (state.pengaturan.saldoAwal[buku] || 0) + total(list, 'masuk') - total(list, 'keluar');
  }

  /** Transaksi milik buku tertentu (default: buku aktif) */
  function transaksiBuku(buku) { const b = buku || state.buku; return state.transaksi.filter((t) => t.buku === b); }
  function transaksiBulan(ym, buku) { return transaksiBuku(buku).filter((t) => t.tanggal.slice(0, 7) === ym); }
  function total(list, jenis) { return list.reduce((s, t) => (t.jenis === jenis ? s + t.jumlah : s), 0); }

  /* ============ Render ============ */
  function renderSemua() {
    renderBuku();
    $('monthLabel').textContent = labelBulan(state.bulan);
    renderRingkasan();
    renderFilterKategori();
    renderDaftar();
    renderKategoriList();
    if (state.view === 'grafik') renderGrafik();
  }

  function renderRingkasan() {
    const list = transaksiBulan(state.bulan);
    const masuk = total(list, 'masuk');
    const keluar = total(list, 'keluar');
    const saldo = masuk - keluar;
    $('sumMasuk').textContent = rupiah(masuk);
    $('sumKeluar').textContent = rupiah(keluar);
    const sekarang = saldoBuku(state.buku);
    $('sumSaldo').textContent = rupiah(sekarang);
    $('sumSaldo').classList.toggle('neg', sekarang < 0);
    $('sumSaldoLabel').textContent = 'Saldo ' + NAMA_BUKU[state.buku] + ' saat ini';
    $('sumTotalLabel').textContent = 'Selisih ' + labelBulan(state.bulan) + ': ';
    $('sumTotal').textContent = rupiah(saldo, true);
    $('sumTotal').classList.toggle('neg', saldo < 0);
  }

  function renderBuku() {
    const usaha = state.buku === 'usaha';
    document.body.classList.toggle('buku-usaha', usaha);
    document.querySelectorAll('.buku-btn').forEach((b) => {
      const aktif = b.dataset.buku === state.buku;
      b.classList.toggle('active', aktif);
      b.setAttribute('aria-checked', aktif);
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', usaha ? '#1d4ed8' : '#0b6e34');
  }

  function gantiBuku(buku) {
    if (buku === state.buku) return;
    state.buku = buku;
    state.filterKategori = '';
    DB.setMeta('bukuAktif', buku).catch(() => {});
    renderSemua();
  }

  function renderFilterKategori() {
    const sel = $('filterKategori');
    const jenisList = state.filterJenis === 'semua' ? ['masuk', 'keluar'] : [state.filterJenis];
    let html = '<option value="">Semua kategori</option>';
    jenisList.forEach((j) => {
      const items = urutKategori(state.kategori.filter((k) => k.jenis === j));
      if (!items.length) return;
      html += '<optgroup label="' + (j === 'masuk' ? 'Pemasukan' : 'Pengeluaran') + '">';
      items.forEach((k) => { html += '<option value="' + esc(k.id) + '">' + esc(k.nama) + '</option>'; });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
    if (state.filterKategori && sel.querySelector('option[value="' + CSS.escape(state.filterKategori) + '"]')) {
      sel.value = state.filterKategori;
    } else {
      state.filterKategori = '';
      sel.value = '';
    }
  }

  function renderDaftar() {
    let list = transaksiBulan(state.bulan);
    if (state.filterJenis !== 'semua') list = list.filter((t) => t.jenis === state.filterJenis);
    if (state.filterKategori) list = list.filter((t) => t.kategori === state.filterKategori);
    list.sort((a, b) => (b.tanggal.localeCompare(a.tanggal)) || String(b.dibuat_pada).localeCompare(String(a.dibuat_pada)));

    const wadah = $('listTransaksi');
    if (!list.length) {
      const adaFilter = state.filterJenis !== 'semua' || state.filterKategori;
      wadah.innerHTML = '<div class="empty"><span class="big">📒</span>' +
        (adaFilter ? 'Tidak ada transaksi yang cocok dengan filter.' :
          'Belum ada transaksi ' + NAMA_BUKU[state.buku] + ' di ' + esc(labelBulan(state.bulan)) + '.<br>Ketuk tombol <strong>＋</strong> untuk menambah.') + '</div>';
      $('listHint').hidden = true;
      return;
    }
    $('listHint').hidden = false;

    const grup = new Map();
    list.forEach((t) => { if (!grup.has(t.tanggal)) grup.set(t.tanggal, []); grup.get(t.tanggal).push(t); });

    let html = '';
    grup.forEach((items, tgl) => {
      const net = total(items, 'masuk') - total(items, 'keluar');
      html += '<div class="tx-group"><div class="tx-date"><span>' + esc(labelTanggal(tgl)) + '</span>' +
        '<span class="tx-day-total ' + (net < 0 ? 'keluar-text' : 'masuk-text') + '">' + esc(rupiah(net, true)) + '</span></div><div class="tx-card">';
      items.forEach((t) => {
        const m = t.jenis === 'masuk';
        html += '<button class="tx-item" data-id="' + esc(t.id) + '">' +
          '<span class="tx-ico ' + t.jenis + '" aria-hidden="true">' + (m ? '↑' : '↓') + '</span>' +
          '<span class="tx-main"><span class="tx-kat">' + esc(namaKategori(t.kategori)) + '</span>' +
          (t.catatan ? '<span class="tx-note">' + esc(t.catatan) + '</span>' : '<span class="tx-note muted">' + (m ? 'Pemasukan' : 'Pengeluaran') + '</span>') +
          '</span><span class="tx-amt ' + t.jenis + '">' + (m ? '+' : '−') + esc(rupiah(t.jumlah)) + '</span></button>';
      });
      html += '</div></div>';
    });
    wadah.innerHTML = html;
  }

  function renderKategoriList() {
    const hitung = {};
    state.transaksi.forEach((t) => { hitung[t.kategori] = (hitung[t.kategori] || 0) + 1; });
    ['masuk', 'keluar'].forEach((j) => {
      const ul = $(j === 'masuk' ? 'katListMasuk' : 'katListKeluar');
      const items = urutKategori(state.kategori.filter((k) => k.jenis === j));
      if (!items.length) { ul.innerHTML = '<li class="muted">Belum ada kategori.</li>'; return; }
      ul.innerHTML = items.map((k) =>
        '<li><span class="kat-name">' + esc(k.nama) + '</span>' +
        '<span class="kat-count">' + (hitung[k.id] || 0) + ' trx</span>' +
        '<button class="kat-btn" data-aksi="ubah" data-id="' + esc(k.id) + '" aria-label="Ubah kategori ' + esc(k.nama) + '">✏️</button>' +
        '<button class="kat-btn" data-aksi="hapus" data-id="' + esc(k.id) + '" aria-label="Hapus kategori ' + esc(k.nama) + '">🗑</button></li>'
      ).join('');
    });
  }

  /* ============ Grafik ============ */
  function setChartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar('--text-2');
    Chart.defaults.borderColor = cssVar('--border');
  }

  function renderGrafik() {
    if (!window.Chart) {
      $('kategoriChartBox').innerHTML = '<div class="chart-empty">Library grafik gagal dimuat.</div>';
      return;
    }
    setChartDefaults();
    renderChartKategori();
    renderChartTren();
  }

  function renderChartKategori() {
    const list = transaksiBulan(state.bulan).filter((t) => t.jenis === 'keluar');
    const per = {};
    list.forEach((t) => { per[t.kategori] = (per[t.kategori] || 0) + t.jumlah; });
    const rows = Object.keys(per).map((id) => ({ nama: namaKategori(id), nilai: per[id] })).sort((a, b) => b.nilai - a.nilai);
    const totalKeluar = rows.reduce((s, r) => s + r.nilai, 0);
    $('kategoriChartSub').textContent = NAMA_BUKU[state.buku] + ' · ' + labelBulan(state.bulan) + ' · total ' + rupiah(totalKeluar);

    const box = $('kategoriChartBox');
    if (chartKategori) { chartKategori.destroy(); chartKategori = null; }
    if (!rows.length) {
      box.style.height = '140px';
      box.innerHTML = '<div class="chart-empty">Belum ada pengeluaran di bulan ini.</div>';
      $('kategoriTable').innerHTML = '';
      return;
    }
    box.style.height = Math.max(120, rows.length * 40 + 40) + 'px';
    box.innerHTML = '<canvas id="chartKategori" role="img" aria-label="Grafik batang pengeluaran per kategori"></canvas>';
    const warna = cssVar('--chart-keluar');
    chartKategori = new Chart($('chartKategori'), {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.nama),
        datasets: [{ label: 'Pengeluaran', data: rows.map((r) => r.nilai), backgroundColor: warna, hoverBackgroundColor: warna, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ' ' + rupiah(c.parsed.x) + ' (' + Math.round(c.parsed.x / totalKeluar * 100) + '%)' } }
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: (v) => rupiahSingkat(v), maxTicksLimit: 5 }, grid: { color: cssVar('--border') }, border: { display: false } },
          y: { grid: { display: false }, ticks: { color: cssVar('--text') }, border: { display: false } }
        }
      }
    });
    $('kategoriTable').innerHTML = '<table><thead><tr><th>Kategori</th><th class="num">Jumlah</th><th class="num">%</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td>' + esc(r.nama) + '</td><td class="num">' + esc(rupiah(r.nilai)) + '</td><td class="num">' + Math.round(r.nilai / totalKeluar * 100) + '%</td></tr>').join('') +
      '</tbody></table>';
  }

  function renderChartTren() {
    const bulanList = [];
    for (let i = 5; i >= 0; i--) bulanList.push(geserBulan(state.bulan, -i));
    const data = bulanList.map((b) => {
      const l = transaksiBulan(b);
      return { bulan: b, masuk: total(l, 'masuk'), keluar: total(l, 'keluar') };
    });
    if (chartTren) chartTren.destroy();
    const cMasuk = cssVar('--chart-masuk');
    const cKeluar = cssVar('--chart-keluar');
    const surface = cssVar('--surface');
    chartTren = new Chart($('chartTren'), {
      type: 'bar',
      data: {
        labels: data.map((d) => labelBulan(d.bulan, true)),
        datasets: [
          { label: 'Pemasukan', data: data.map((d) => d.masuk), backgroundColor: cMasuk, hoverBackgroundColor: cMasuk, borderRadius: 4, borderSkipped: 'start', borderColor: surface, borderWidth: { left: 1, right: 1 }, maxBarThickness: 22 },
          { label: 'Pengeluaran', data: data.map((d) => d.keluar), backgroundColor: cKeluar, hoverBackgroundColor: cKeluar, borderRadius: 4, borderSkipped: 'start', borderColor: surface, borderWidth: { left: 1, right: 1 }, maxBarThickness: 22 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => labelBulan(bulanList[items[0].dataIndex]),
              label: (c) => ' ' + c.dataset.label + ': ' + rupiah(c.parsed.y),
              footer: (items) => { const d = data[items[0].dataIndex]; return 'Selisih: ' + rupiah(d.masuk - d.keluar); }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => rupiahSingkat(v), maxTicksLimit: 5 }, grid: { color: cssVar('--border') }, border: { display: false } },
          x: { grid: { display: false }, border: { display: false } }
        }
      }
    });
    $('trenTable').innerHTML = '<table><thead><tr><th>Bulan</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Selisih</th></tr></thead><tbody>' +
      data.slice().reverse().map((d) => {
        const s = d.masuk - d.keluar;
        return '<tr><td>' + esc(labelBulan(d.bulan, true)) + '</td><td class="num masuk-text">' + esc(rupiahSingkat(d.masuk)) + '</td><td class="num keluar-text">' +
          esc(rupiahSingkat(d.keluar)) + '</td><td class="num ' + (s < 0 ? 'keluar-text' : '') + '">' + esc(rupiahSingkat(s)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ============ Navigasi ============ */
  function gantiView(v) {
    state.view = v;
    document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
    document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.view === v));
    $('fabTambah').hidden = v === 'atur';
    window.scrollTo(0, 0);
    if (v === 'grafik') renderGrafik();
  }

  /* ============ Form transaksi ============ */
  function isiPilihanKategori(jenis, terpilih) {
    const items = urutKategori(state.kategori.filter((k) => k.jenis === jenis));
    const sel = $('txKategori');
    sel.innerHTML = items.map((k) => '<option value="' + esc(k.id) + '">' + esc(k.nama) + '</option>').join('') ||
      '<option value="">— Belum ada kategori —</option>';
    if (terpilih && items.some((k) => k.id === terpilih)) sel.value = terpilih;
  }
  function setFormJenis(jenis, terpilih) {
    state.formJenis = jenis;
    document.querySelectorAll('.jt').forEach((b) => {
      const aktif = b.dataset.jenis === jenis;
      b.classList.toggle('active', aktif);
      b.setAttribute('aria-checked', aktif);
    });
    isiPilihanKategori(jenis, terpilih);
  }
  function bukaForm(tx) {
    $('txError').hidden = true;
    if (tx) {
      $('sheetTitle').textContent = 'Ubah Transaksi';
      $('txId').value = tx.id;
      $('txBuku').value = tx.buku;
      $('txKirimWa').hidden = tx.buku !== 'usaha';
      aturGambar(null);
      setFormJenis(tx.jenis, tx.kategori);
      $('txJumlah').value = titikRibuan(tx.jumlah);
      $('txTanggal').value = tx.tanggal;
      $('txCatatan').value = tx.catatan || '';
      $('txSubmit').textContent = 'Simpan Perubahan';
      $('txHapus').hidden = false;
    } else {
      $('sheetTitle').textContent = 'Tambah Transaksi';
      $('txId').value = '';
      $('txBuku').value = state.buku;
      $('txKirimWa').hidden = true;
      aturGambar(null);
      setFormJenis(state.filterJenis === 'masuk' ? 'masuk' : 'keluar');
      $('txJumlah').value = '';
      $('txTanggal').value = hariIni();
      $('txCatatan').value = '';
      $('txSubmit').textContent = 'Simpan';
      $('txHapus').hidden = true;
    }
    tampilkanKotakGambar();
    $('sheetOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    if (!tx) setTimeout(() => $('txJumlah').focus(), 120);
  }
  function tutupForm() {
    $('sheetOverlay').hidden = true;
    document.body.style.overflow = '';
  }
  function angkaDariInput(s) { return parseInt(String(s).replace(/\D/g, ''), 10) || 0; }

  async function simpanForm(e) {
    e.preventDefault();
    const jumlah = angkaDariInput($('txJumlah').value);
    const kategori = $('txKategori').value;
    const tanggal = $('txTanggal').value;
    const err = $('txError');
    let pesan = '';
    if (!jumlah || jumlah <= 0) pesan = 'Jumlah harus lebih dari 0.';
    else if (!kategori) pesan = 'Pilih kategori terlebih dahulu.';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) pesan = 'Tanggal belum diisi.';
    if (pesan) { err.textContent = pesan; err.hidden = false; return; }

    const id = $('txId').value;
    const lama = id ? state.transaksi.find((t) => t.id === id) : null;
    const sebelum = lama ? Object.assign({}, lama) : null;
    const tx = {
      id: id || DB.buatId('trx'),
      buku: $('txBuku').value === 'usaha' ? 'usaha' : 'pribadi',
      tanggal,
      jenis: state.formJenis,
      kategori,
      jumlah,
      catatan: $('txCatatan').value.trim(),
      dibuat_pada: lama ? lama.dibuat_pada : new Date().toISOString()
    };
    try {
      await DB.simpan('transaksi', tx);
    } catch (ex) {
      err.textContent = 'Gagal menyimpan: ' + ex.message;
      err.hidden = false;
      return;
    }
    if (lama) Object.assign(lama, tx); else state.transaksi.push(tx);
    tutupForm();
    if (tanggal.slice(0, 7) !== state.bulan) state.bulan = tanggal.slice(0, 7);
    if (tx.buku !== state.buku) { state.buku = tx.buku; state.filterKategori = ''; DB.setMeta('bukuAktif', tx.buku).catch(() => {}); }
    renderSemua();
    toast(lama ? 'Perubahan disimpan' : 'Transaksi disimpan ✔');
    // Buku Usaha: buat teks laporan WhatsApp otomatis
    if (tx.buku === 'usaha' || (sebelum && sebelum.buku === 'usaha')) {
      const teks = tx.buku === 'usaha' ? teksWa(lama ? 'koreksi' : 'baru', tx, sebelum) : teksWa('batal', sebelum);
      if (teks) kirimOtomatis(teks);
    }
    mintaPenyimpananPermanen();
    cekPengingatBackup();
  }

  async function hapusDariForm() {
    const id = $('txId').value;
    const tx = state.transaksi.find((t) => t.id === id);
    if (!tx) return;
    const ok = await konfirmasi('Hapus transaksi?',
      esc(namaKategori(tx.kategori)) + ' · <strong>' + esc(rupiah(tx.jumlah)) + '</strong><br>' + esc(labelTanggal(tx.tanggal)) +
      (tx.catatan ? '<br><em>' + esc(tx.catatan) + '</em>' : ''), 'Ya, Hapus', true);
    if (!ok) return;
    aturGambar(null);
    await DB.hapus('transaksi', id);
    state.transaksi = state.transaksi.filter((t) => t.id !== id);
    tutupForm();
    renderSemua();
    if (tx.buku === 'usaha') kirimOtomatis(teksWa('batal', tx));
    toast('Transaksi dihapus', {
      label: 'URUNGKAN',
      fn: async () => { await DB.simpan('transaksi', tx); state.transaksi.push(tx); renderSemua(); toast('Transaksi dikembalikan'); }
    });
  }

  /* ============ Teks WhatsApp (buku Usaha) ============ */
  /** Angka dengan koma ribuan, format catatan WhatsApp: 1,028,845 / -3,277,155 */
  function angkaKoma(n) {
    const r = Math.round(n);
    return (r < 0 ? '-' : '') + String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function efek(t) { return t && t.buku === 'usaha' ? (t.jenis === 'masuk' ? t.jumlah : -t.jumlah) : 0; }
  /**
   * Teks WhatsApp format saldo berjalan:  saldo_sebelum ± jumlah = saldo_sesudah
   * (state.transaksi sudah berisi kondisi SESUDAH perubahan)
   * jenisLaporan: 'baru' | 'koreksi' | 'batal'. Mengembalikan null jika saldo tidak berubah.
   */
  function teksWa(jenisLaporan, tx, sebelum) {
    const sesudah = saldoBuku('usaha');
    let perubahan;
    const baris = [];
    if (jenisLaporan === 'batal') {
      perubahan = -efek(tx);
      baris.push('Batal: ' + (tx.jenis === 'masuk' ? '+' : '-') + angkaKoma(tx.jumlah));
    } else if (jenisLaporan === 'koreksi' && sebelum && sebelum.buku === 'usaha') {
      perubahan = efek(tx) - efek(sebelum);
      if (perubahan === 0) return null;
      baris.push('Koreksi: ' + (sebelum.jenis === 'masuk' ? '+' : '-') + angkaKoma(sebelum.jumlah) + ' → ' + (tx.jenis === 'masuk' ? '+' : '-') + angkaKoma(tx.jumlah));
    } else {
      perubahan = efek(tx);
    }
    const awal = sesudah - perubahan;
    // Keterangan di belakang saldo sesudah hanya jika catatan diisi manual
    const ket = (tx.catatan || '').trim();
    baris.push(angkaKoma(awal) + (perubahan < 0 ? ' - ' : ' + ') + angkaKoma(Math.abs(perubahan)) + ' = ' + angkaKoma(sesudah) + (ket ? ' (' + ket + ')' : ''));
    return baris.join('\n');
  }
  /** Aksi otomatis setelah transaksi Usaha disimpan/dihapus (sesuai Pengaturan) */
  async function kirimOtomatis(teks) {
    const aksi = aksiWa();
    if (aksi === 'mati') { aturGambar(null); return; }
    // Ada gambar: link wa.me tidak bisa membawa gambar → pakai menu Bagikan (gambar + teks sekaligus)
    if (gambarWa) {
      if (bisaBagikanGambar()) {
        const hasil = await bagikanGambar(teks);
        if (hasil === 'ok') { aturGambar(null); toast('Gambar + teks terkirim ✔'); return; }
        if (hasil === 'batal') toast('Pengiriman dibatalkan — kirim lagi dari lembar ini');
      }
      bukaWa(teks); // gambar tetap terlampir di lembar WhatsApp
      return;
    }
    if (aksi === 'lembar') { bukaWa(teks); return; }
    if (aksi === 'sekaligus') { kirimKeSemua(teks); return; }
    if (aksi === 'bagikan') {
      try {
        await navigator.share({ text: teks });
        toast('Terkirim ✔');
      } catch (ex) {
        if (ex && ex.name === 'AbortError') toast('Pengiriman dibatalkan — buka transaksinya untuk kirim ulang');
        else bukaWa(teks); // menu Bagikan tidak bisa dibuka → tampilkan pilihan manual
      }
      return;
    }
    const k = state.pengaturan.waKontak.find((x) => 'kontak:' + x.id === aksi);
    if (k) {
      $('waTeks').value = teks;
      kirimWa(k.nomor);
      return;
    }
    bukaWa(teks);
  }
  /** Aksi yang berlaku; jatuh ke 'lembar' jika pilihan tidak bisa dipakai di HP ini */
  function aksiWa() {
    const p = state.pengaturan;
    let a = p.waAksi || 'sekaligus';
    if (p.waOtomatis === false) a = 'mati';
    if (a === 'sekaligus' && !p.waKontak.length) a = navigator.share ? 'bagikan' : 'lembar';
    if (a === 'bagikan' && !navigator.share) a = 'lembar';
    if (a.startsWith('kontak:') && !p.waKontak.some((x) => 'kontak:' + x.id === a)) a = 'lembar';
    return a;
  }
  /* ---- Kirim ke semua nomor tersimpan: chat tiap nomor dibuka berurutan dengan teks siap kirim ---- */
  let antrianWa = null;
  function kirimKeSemua(teks) {
    const list = state.pengaturan.waKontak.slice();
    if (!list.length) { bukaWa(teks); return; }
    tutupWa();
    antrianWa = { teks, list, i: 0, dibuka: false };
    lanjutAntrianWa();
  }
  function lanjutAntrianWa() {
    if (!antrianWa) return;
    const k = antrianWa.list[antrianWa.i];
    antrianWa.i += 1;
    antrianWa.dibuka = true;
    kirimWa(k.nomor, null, antrianWa.teks);
  }
  /** Dipanggil saat kembali ke aplikasi dari WhatsApp */
  async function kembaliDariWa() {
    if (!antrianWa || !antrianWa.dibuka) return;
    antrianWa.dibuka = false;
    const q = antrianWa;
    const sudah = q.list.slice(0, q.i).map((k) => esc(k.nama)).join(', ');
    if (q.i >= q.list.length) {
      antrianWa = null;
      toast('Terkirim ke semua: ' + q.list.map((k) => k.nama).join(', ') + ' ✔');
      return;
    }
    const next = q.list[q.i];
    const pilihan = await dialog('Lanjut kirim?',
      '<p>✓ Sudah dibuka: <strong>' + sudah + '</strong></p><p>Berikutnya: <strong>' + esc(next.nama) + '</strong> (' + (q.i + 1) + ' dari ' + q.list.length + ')</p>',
      [{ label: '💬 Kirim ke ' + next.nama, nilai: 'lanjut', kelas: 'btn-wa btn-lg' }, { label: 'Selesai', nilai: null, kelas: 'btn-ghost' }]);
    if (pilihan === 'lanjut' && antrianWa === q) lanjutAntrianWa();
    else antrianWa = null;
  }
  /* ---- Gambar untuk WhatsApp (hanya di memori, tidak disimpan ke database) ---- */
  let gambarWa = null;
  let urlGambar = '';
  function aturGambar(file) {
    gambarWa = file || null;
    if (urlGambar) { URL.revokeObjectURL(urlGambar); urlGambar = ''; }
    if (gambarWa) urlGambar = URL.createObjectURL(gambarWa);
    ['tx', 'wa'].forEach((p) => {
      $(p + 'GambarPreview').hidden = !gambarWa;
      $(p + 'GambarPilih').hidden = !!gambarWa;
      $(p + 'GambarImg').src = urlGambar || '';
      $(p + 'Gambar').value = '';
    });
    $('waGambarKirimBox').hidden = !gambarWa;
  }
  function tampilkanKotakGambar() { $('txGambarBox').hidden = $('txBuku').value !== 'usaha'; }
  function bisaBagikanGambar() {
    if (!navigator.share || !navigator.canShare) return false;
    try { return navigator.canShare({ files: [new File([''], 'cek.jpg', { type: 'image/jpeg' })] }); } catch (_) { return false; }
  }
  /** Perkecil foto kamera (bisa 5–10 MB) agar cepat dikirim; jika gagal pakai file aslinya */
  async function siapkanGambar(file) {
    if (!file || !/^image\//.test(file.type)) return null;
    if (file.size < 600 * 1024 || !window.createImageBitmap) return file;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const maks = 1600;
      const skala = Math.min(1, maks / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * skala);
      c.height = Math.round(bmp.height * skala);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      if (!blob || blob.size >= file.size) return file;
      const nama = (file.name || 'gambar').replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], nama, { type: 'image/jpeg', lastModified: Date.now() });
    } catch (_) { return file; }
  }
  async function pilihGambar(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const hasil = await siapkanGambar(f);
    if (!hasil) { info('Bukan gambar', 'Pilih file foto/gambar (JPG, PNG, dll.).'); e.target.value = ''; return; }
    aturGambar(hasil);
  }
  /** Bagikan gambar + teks lewat menu Bagikan. Hasil: 'ok' | 'batal' | 'gagal' */
  async function bagikanGambar(teks) {
    const data = { files: [gambarWa], text: teks };
    try {
      if (navigator.canShare && !navigator.canShare(data)) return 'gagal';
      await navigator.share(data);
      return 'ok';
    } catch (ex) {
      return ex && ex.name === 'AbortError' ? 'batal' : 'gagal';
    }
  }
  async function kirimGambarDariLembar() {
    if (!gambarWa) return;
    if (!bisaBagikanGambar()) {
      info('Tidak didukung di HP ini', 'Browser ini tidak bisa mengirim gambar langsung ke WhatsApp. Kirim teksnya dengan tombol di bawah, lalu lampirkan gambar secara manual di WhatsApp.');
      return;
    }
    const hasil = await bagikanGambar($('waTeks').value);
    if (hasil === 'ok') { tutupWa(); toast('Gambar + teks terkirim ✔'); }
    else if (hasil === 'gagal') info('Gagal membagikan', 'Gambar tidak bisa dibagikan. Coba gambar lain, atau kirim teks saja lalu lampirkan gambar di WhatsApp.');
  }

  function nomorWa(n) {
    let d = String(n || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    else if (d.startsWith('8')) d = '62' + d;
    return d;
  }
  function bukaWa(teks) {
    $('waTeks').value = teks;
    renderTujuanWa();
    $('waSekaligusBox').hidden = !state.pengaturan.waKontak.length;
    $('waBagikan').hidden = !navigator.share;
    $('waGambarKirimBox').hidden = !gambarWa;
    $('waOverlay').hidden = false;
    $('toast').hidden = true;
    document.body.style.overflow = 'hidden';
  }
  function renderTujuanWa() {
    const list = state.pengaturan.waKontak;
    $('waTujuanList').innerHTML = list.length
      ? list.map((k) => '<button type="button" class="btn btn-block wa-tujuan ' + 'btn-wa-outline' + '" data-id="' + esc(k.id) + '">' +
          '<span class="wa-tujuan-teks">💬 Kirim ke <strong>' + esc(k.nama) + '</strong><small>+' + esc(nomorWa(k.nomor)) + '</small></span></button>').join('')
      : '<p class="note">Belum ada nomor tersimpan. Tambahkan di <strong>Pengaturan → WhatsApp untuk Buku Usaha</strong>, atau pilih kontak di bawah.</p>';
    const nama = list.map((k) => k.nama);
    $('waSekaligusNama').textContent = nama.join(', ');
    $('waSemuaLabel').textContent = nama.join(' & ');
    $('waKirimLain').className = 'btn btn-block ' + (list.length ? 'btn-outline' : 'btn-wa btn-lg');
  }
  function tutupWa() {
    aturGambar(null);
    $('waOverlay').hidden = true;
    document.body.style.overflow = '';
  }
  /** Buka WhatsApp; nomor kosong = pilih kontak/grup sendiri. Lembar tetap terbuka agar bisa kirim ke nomor berikutnya. */
  function kirimWa(nomor, tombol, teks) {
    const url = 'https://wa.me/' + nomorWa(nomor) + '?text=' + encodeURIComponent(teks == null ? $('waTeks').value : teks);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (tombol) {
      tombol.classList.add('terkirim');
      const t = tombol.querySelector('.wa-tujuan-teks');
      if (t && !tombol.querySelector('.cek')) t.insertAdjacentHTML('afterbegin', '<span class="cek">✓ </span>');
    }
  }
  async function bagikanWa() {
    // Lembar Bagikan Android/iPhone: di WhatsApp bisa centang beberapa chat sekaligus lalu kirim sekali
    try {
      await navigator.share({ text: $('waTeks').value });
      tutupWa();
      toast('Terkirim lewat menu Bagikan ✔');
    } catch (ex) {
      if (!ex || ex.name !== 'AbortError') { await salinWa(); }
    }
  }
  async function salinWa() {
    const teks = $('waTeks').value;
    try {
      await navigator.clipboard.writeText(teks);
    } catch (_) {
      $('waTeks').select();
      document.execCommand('copy');
    }
    toast('Teks disalin — tempel di WhatsApp');
  }
  function renderPengaturanUsaha() {
    renderDaftarKontak();
    renderPilihanAksi();
    const fmt = (n) => (n < 0 ? '-' : '') + (n ? titikRibuan(n) : '');
    $('setAwalPribadi').value = fmt(state.pengaturan.saldoAwal.pribadi);
    $('setAwalUsaha').value = fmt(state.pengaturan.saldoAwal.usaha);
  }
  function angkaBertanda(s) {
    const n = angkaDariInput(s);
    return /^\s*-/.test(String(s)) ? -n : n;
  }
  function formatInputBertanda(e) {
    const neg = /^\s*-/.test(e.target.value);
    const n = angkaDariInput(e.target.value);
    e.target.value = (neg ? '-' : '') + (n ? titikRibuan(Math.min(n, 999999999999999)) : '');
  }
  async function simpanSaldoAwal(e) {
    e.preventDefault();
    state.pengaturan = Object.assign({}, state.pengaturan, {
      saldoAwal: { pribadi: angkaBertanda($('setAwalPribadi').value), usaha: angkaBertanda($('setAwalUsaha').value) }
    });
    await DB.setMeta('pengaturan', state.pengaturan);
    renderSemua();
    renderPengaturanUsaha();
    toast('Saldo awal disimpan');
  }
  function renderDaftarKontak() {
    const list = state.pengaturan.waKontak;
    $('waList').innerHTML = list.length ? list.map((k) =>
      '<li><span class="kat-name">' + esc(k.nama) + '<small class="wa-no">+' + esc(nomorWa(k.nomor)) + '</small></span>' +
      '<button class="kat-btn" data-aksi="ubah" data-id="' + esc(k.id) + '" aria-label="Ubah ' + esc(k.nama) + '">✏️</button>' +
      '<button class="kat-btn" data-aksi="hapus" data-id="' + esc(k.id) + '" aria-label="Hapus ' + esc(k.nama) + '">🗑</button></li>'
    ).join('') : '<li class="muted">Belum ada nomor. Tambahkan di bawah.</li>';
  }
  async function simpanKontak() {
    await DB.setMeta('pengaturan', state.pengaturan);
    renderDaftarKontak();
    renderPilihanAksi();
  }
  function cekNomor(nomor) {
    const d = nomorWa(nomor);
    return d.length >= 10 && d.length <= 15;
  }
  async function tambahKontak(e) {
    e.preventDefault();
    const nama = $('waKontakNama').value.trim();
    const nomor = $('waKontakNomor').value.trim();
    if (!nama) return;
    if (!cekNomor(nomor)) { info('Nomor tidak valid', 'Periksa lagi nomor WhatsApp-nya, mis. <strong>0812 3456 7890</strong>.'); return; }
    if (state.pengaturan.waKontak.some((k) => nomorWa(k.nomor) === nomorWa(nomor))) { info('Nomor sudah ada', 'Nomor ini sudah tersimpan.'); return; }
    state.pengaturan.waKontak.push({ id: DB.buatId('wa'), nama, nomor });
    await simpanKontak();
    $('waKontakNama').value = '';
    $('waKontakNomor').value = '';
    toast('Nomor ' + nama + ' ditambahkan');
  }
  async function ubahKontak(id) {
    const k = state.pengaturan.waKontak.find((x) => x.id === id);
    if (!k) return;
    const hasil = await dialog('Ubah Nomor WhatsApp',
      '<label class="field"><span>Nama</span><input type="text" id="dlgWaNama" maxlength="30" value="' + esc(k.nama) + '"></label>' +
      '<label class="field"><span>Nomor</span><input type="tel" id="dlgWaNomor" inputmode="tel" maxlength="20" value="' + esc(k.nomor) + '"></label>',
      [{ label: 'Simpan', nilai: 'simpan', kelas: 'btn-primary' }, { label: 'Batal', nilai: null, kelas: 'btn-ghost' }]);
    if (hasil !== 'simpan') return;
    const nama = $('dlgWaNama').value.trim();
    const nomor = $('dlgWaNomor').value.trim();
    if (!nama || !cekNomor(nomor)) { info('Data tidak valid', 'Nama tidak boleh kosong dan nomor harus nomor WhatsApp yang benar.'); return; }
    k.nama = nama;
    k.nomor = nomor;
    await simpanKontak();
    toast('Nomor diperbarui');
  }
  async function hapusKontak(id) {
    const k = state.pengaturan.waKontak.find((x) => x.id === id);
    if (!k) return;
    const ok = await konfirmasi('Hapus nomor?', 'Nomor <strong>' + esc(k.nama) + '</strong> (+' + esc(nomorWa(k.nomor)) + ') akan dihapus dari daftar.', 'Ya, Hapus', true);
    if (!ok) return;
    state.pengaturan.waKontak = state.pengaturan.waKontak.filter((x) => x.id !== id);
    await simpanKontak();
    toast('Nomor dihapus');
  }
  function renderPilihanAksi() {
    const sel = $('setWaAksi');
    let html = '';
    const nama = state.pengaturan.waKontak.map((k) => k.nama).join(' & ');
    if (state.pengaturan.waKontak.length) html += '<option value="sekaligus">🚀 Langsung kirim ke semua nomor (' + esc(nama) + ')</option>';
    if (navigator.share) html += '<option value="bagikan">📤 Buka menu Bagikan (pilih chat sendiri)</option>';
    state.pengaturan.waKontak.forEach((k) => { html += '<option value="kontak:' + esc(k.id) + '">💬 Langsung kirim ke ' + esc(k.nama) + '</option>'; });
    html += '<option value="lembar">📝 Tampilkan teks dulu (bisa diedit)</option>';
    html += '<option value="mati">⛔ Jangan kirim apa-apa</option>';
    sel.innerHTML = html;
    sel.value = aksiWa();
  }
  async function simpanWaAksi() {
    state.pengaturan.waAksi = $('setWaAksi').value;
    state.pengaturan.waOtomatis = true;
    await DB.setMeta('pengaturan', state.pengaturan);
    toast('Pengaturan kirim otomatis disimpan');
  }

  /* ============ Kategori ============ */
  function namaSudahAda(nama, jenis, kecualiId) {
    const n = nama.trim().toLowerCase();
    return state.kategori.some((k) => k.jenis === jenis && k.id !== kecualiId && k.nama.trim().toLowerCase() === n);
  }

  async function tambahKategori(e) {
    e.preventDefault();
    const nama = $('katNama').value.trim();
    const jenis = $('katJenis').value;
    if (!nama) return;
    if (namaSudahAda(nama, jenis)) { info('Nama sudah dipakai', 'Kategori <strong>' + esc(nama) + '</strong> sudah ada di ' + (jenis === 'masuk' ? 'Pemasukan' : 'Pengeluaran') + '.'); return; }
    const k = { id: DB.buatId('kat'), nama, jenis };
    await DB.simpan('kategori', k);
    state.kategori.push(k);
    $('katNama').value = '';
    renderSemua();
    toast('Kategori "' + nama + '" ditambahkan');
  }

  async function ubahKategori(id) {
    const k = kategoriById(id);
    if (!k) return;
    const tunggu = dialog('Ubah Kategori',
      '<label class="field"><span>Nama kategori</span><input type="text" id="dlgNama" maxlength="30" value="' + esc(k.nama) + '"></label>' +
      '<label class="field"><span>Jenis</span><select id="dlgJenis"><option value="keluar">Pengeluaran</option><option value="masuk">Pemasukan</option></select></label>' +
      '<p class="note">Mengubah jenis juga memindahkan jenis semua transaksi di kategori ini.</p>',
      [{ label: 'Simpan', nilai: 'simpan', kelas: 'btn-primary' }, { label: 'Batal', nilai: null, kelas: 'btn-ghost' }]
    );
    $('dlgJenis').value = k.jenis;
    const hasil = await tunggu;
    if (hasil !== 'simpan') return;
    const nama = (document.getElementById('dlgNama') || {}).value;
    const jenis = (document.getElementById('dlgJenis') || {}).value;
    if (!nama || !nama.trim()) { info('Nama kosong', 'Nama kategori tidak boleh kosong.'); return; }
    if (namaSudahAda(nama, jenis, id)) { info('Nama sudah dipakai', 'Kategori dengan nama itu sudah ada.'); return; }
    const jenisBerubah = jenis !== k.jenis;
    k.nama = nama.trim();
    k.jenis = jenis;
    await DB.simpan('kategori', k);
    if (jenisBerubah) {
      for (const t of state.transaksi.filter((t) => t.kategori === id)) {
        t.jenis = jenis;
        await DB.simpan('transaksi', t);
      }
    }
    renderSemua();
    toast('Kategori diperbarui');
  }

  async function hapusKategori(id) {
    const k = kategoriById(id);
    if (!k) return;
    const dipakai = state.transaksi.filter((t) => t.kategori === id).length;
    if (!dipakai) {
      const ok = await konfirmasi('Hapus kategori?', 'Kategori <strong>' + esc(k.nama) + '</strong> akan dihapus.', 'Ya, Hapus', true);
      if (!ok) return;
      await DB.hapusKategori(id);
    } else {
      const lain = urutKategori(state.kategori.filter((x) => x.jenis === k.jenis && x.id !== id));
      if (!lain.length) {
        info('Tidak bisa dihapus', 'Kategori <strong>' + esc(k.nama) + '</strong> dipakai oleh ' + dipakai + ' transaksi dan tidak ada kategori ' +
          (k.jenis === 'masuk' ? 'pemasukan' : 'pengeluaran') + ' lain untuk menampung transaksinya. Tambahkan kategori lain dulu.');
        return;
      }
      const hasil = await dialog('Hapus kategori?',
        '<p>Kategori <strong>' + esc(k.nama) + '</strong> dipakai oleh <strong>' + dipakai + ' transaksi</strong>. Pindahkan transaksi tersebut ke:</p>' +
        '<select id="dlgPindah">' + lain.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.nama) + '</option>').join('') + '</select>',
        [{ label: 'Pindahkan & Hapus', nilai: 'ya', kelas: 'btn-danger' }, { label: 'Batal', nilai: null, kelas: 'btn-ghost' }]
      );
      if (hasil !== 'ya') return;
      const tujuan = $('dlgPindah').value;
      await DB.hapusKategori(id, tujuan);
      state.transaksi.forEach((t) => { if (t.kategori === id) t.kategori = tujuan; });
    }
    state.kategori = state.kategori.filter((x) => x.id !== id);
    if (state.filterKategori === id) state.filterKategori = '';
    renderSemua();
    toast('Kategori dihapus');
  }

  /* ============ Simpan file (download / share) ============ */
  async function simpanFile(isi, namaFile, mime) {
    const blob = new Blob([isi], { type: mime });
    // iPhone/iPad: lembar "Bagikan" lebih andal (bisa Simpan ke File, kirim WhatsApp, dll.)
    if (isIOS() && navigator.canShare) {
      try {
        const file = new File([blob], namaFile, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: namaFile });
          return true;
        }
      } catch (ex) {
        if (ex && ex.name === 'AbortError') return false;
        // lanjut ke cara unduh biasa
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = namaFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  /* ============ Backup & restore ============ */
  async function backup() {
    const [kategori, transaksi] = await Promise.all([DB.semua('kategori'), DB.semua('transaksi')]);
    const data = {
      aplikasi: 'ES Keuangan',
      format: 2,
      versi_aplikasi: APP_VERSION,
      diekspor_pada: new Date().toISOString(),
      jumlah_transaksi: transaksi.length,
      pengaturan: state.pengaturan,
      kategori,
      transaksi
    };
    const namaFile = 'es-keuangan-backup-' + hariIni() + '.json';
    const ok = await simpanFile(JSON.stringify(data, null, 2), namaFile, 'application/json');
    if (!ok) { toast('Backup dibatalkan'); return; }
    await DB.setMeta('lastBackup', new Date().toISOString());
    await DB.setMeta('snoozeBackup', null);
    toast('Backup tersimpan: ' + namaFile);
    renderInfoBackup();
    cekPengingatBackup();
  }

  function validasiBackup(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Isi file bukan data backup.');
    if (!Array.isArray(obj.kategori) || !Array.isArray(obj.transaksi)) throw new Error('File ini bukan backup ES Keuangan (data kategori/transaksi tidak ditemukan).');
    const kategori = obj.kategori.map((k, i) => {
      if (!k || !k.id || typeof k.nama !== 'string' || !['masuk', 'keluar'].includes(k.jenis)) throw new Error('Data kategori ke-' + (i + 1) + ' tidak valid.');
      return { id: String(k.id), nama: k.nama.trim().slice(0, 30) || 'Tanpa nama', jenis: k.jenis };
    });
    const transaksi = obj.transaksi.map((t, i) => {
      const jumlah = Math.round(Number(t && t.jumlah));
      if (!t || !t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.tanggal) || !['masuk', 'keluar'].includes(t.jenis) || !isFinite(jumlah) || jumlah < 0) {
        throw new Error('Data transaksi ke-' + (i + 1) + ' tidak valid.');
      }
      return {
        id: String(t.id), buku: t.buku === 'usaha' ? 'usaha' : 'pribadi', tanggal: t.tanggal, jenis: t.jenis, kategori: String(t.kategori || ''), jumlah,
        catatan: typeof t.catatan === 'string' ? t.catatan : '',
        dibuat_pada: t.dibuat_pada || new Date().toISOString()
      };
    });
    const pengaturan = obj.pengaturan && typeof obj.pengaturan === 'object' ? {
      namaUsaha: String(obj.pengaturan.namaUsaha || '').slice(0, 60),
      waKontak: normalKontak(obj.pengaturan),
      waOtomatis: obj.pengaturan.waOtomatis !== false,
      waAksi: typeof obj.pengaturan.waAksi === 'string' ? obj.pengaturan.waAksi.slice(0, 80) : 'sekaligus',
      saldoAwal: normalSaldoAwal(obj.pengaturan.saldoAwal)
    } : null;
    return { kategori, transaksi, pengaturan, diekspor_pada: obj.diekspor_pada };
  }

  async function restoreDariFile(file) {
    let data;
    try {
      const teks = await file.text();
      data = validasiBackup(JSON.parse(teks));
    } catch (ex) {
      info('Restore gagal', esc(ex instanceof SyntaxError ? 'File rusak atau bukan file JSON.' : ex.message));
      return;
    }
    const tgl = data.diekspor_pada ? formatWaktu(data.diekspor_pada) : 'tidak diketahui';
    const pilihan = await dialog('Restore data',
      '<p>File backup berisi <strong>' + data.transaksi.length + ' transaksi</strong> (' +
        data.transaksi.filter((t) => t.buku === 'pribadi').length + ' Pribadi, ' + data.transaksi.filter((t) => t.buku === 'usaha').length + ' Usaha) dan <strong>' + data.kategori.length + ' kategori</strong> (dibuat ' + esc(tgl) + ').</p>' +
      '<p><strong>Ganti semua data</strong>: data di HP ini (' + state.transaksi.length + ' transaksi) dihapus dan diganti isi backup.<br>' +
      '<strong>Gabungkan</strong>: isi backup ditambahkan ke data yang ada (transaksi yang sama tidak dobel).</p>',
      [
        { label: 'Ganti Semua Data', nilai: 'ganti', kelas: 'btn-danger' },
        { label: 'Gabungkan', nilai: 'gabung', kelas: 'btn-primary' },
        { label: 'Batal', nilai: null, kelas: 'btn-ghost' }
      ]);
    if (!pilihan) return;
    if (pilihan === 'ganti' && state.transaksi.length) {
      const yakin = await konfirmasi('Yakin ganti semua data?', 'Sebanyak ' + state.transaksi.length + ' transaksi di HP ini akan dihapus permanen. Sebaiknya backup dulu data saat ini jika ragu.', 'Ya, Ganti', true);
      if (!yakin) return;
    }
    try {
      await DB.impor(data, pilihan);
    } catch (ex) {
      info('Restore gagal', esc(ex.message));
      return;
    }
    // Ganti semua: pengaturan & saldo awal ikut dari backup. Gabungkan: pengaturan di HP ini dipertahankan.
    if (data.pengaturan && pilihan === 'ganti') {
      await DB.setMeta('pengaturan', data.pengaturan);
    }
    await muatData();
    state.filterKategori = '';
    renderSemua();
    renderPengaturanUsaha();
    info('Restore berhasil', 'Data berhasil dipulihkan. Sekarang ada ' + state.transaksi.length + ' transaksi.');
  }

  async function renderInfoBackup() {
    const last = await DB.getMeta('lastBackup');
    const el = $('lastBackupText');
    if (!last) { el.textContent = 'Belum pernah backup.'; return; }
    const hari = Math.floor((Date.now() - new Date(last).getTime()) / HARI_MS);
    el.textContent = 'Backup terakhir: ' + formatWaktu(last) + ' (' + (hari === 0 ? 'hari ini' : hari + ' hari lalu') + ')';
  }

  async function cekPengingatBackup() {
    const banner = $('backupReminder');
    if (!state.transaksi.length) { banner.hidden = true; return; }
    const [last, mulai, snooze] = await Promise.all([DB.getMeta('lastBackup'), DB.getMeta('mulai'), DB.getMeta('snoozeBackup')]);
    const sekarang = Date.now();
    if (snooze && sekarang < new Date(snooze).getTime()) { banner.hidden = true; return; }
    let acuan = last || mulai;
    if (!acuan) acuan = state.transaksi.reduce((m, t) => (t.dibuat_pada < m ? t.dibuat_pada : m), new Date().toISOString());
    const selisih = sekarang - new Date(acuan).getTime();
    if (selisih <= BATAS_BACKUP_HARI * HARI_MS) { banner.hidden = true; return; }
    const hari = Math.floor(selisih / HARI_MS);
    $('backupReminderText').textContent = last
      ? 'Backup terakhir ' + hari + ' hari lalu. Simpan backup baru supaya data aman jika HP hilang atau rusak.'
      : 'Anda belum pernah backup sejak ' + hari + ' hari lalu. Data hanya ada di HP ini — simpan backup supaya aman.';
    banner.hidden = false;
  }

  /* ============ Ekspor CSV ============ */
  function csvSel(v) {
    const s = String(v == null ? '' : v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  async function eksporCsv(semuaData) {
    let list = semuaData ? state.transaksi.slice() : transaksiBulan(state.bulan);
    if (!list.length) { info('Tidak ada data', semuaData ? 'Belum ada transaksi untuk diekspor.' : 'Tidak ada transaksi ' + NAMA_BUKU[state.buku] + ' di ' + esc(labelBulan(state.bulan)) + '.'); return; }
    list.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || String(a.dibuat_pada).localeCompare(String(b.dibuat_pada)));
    const baris = [['Buku', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Catatan', 'Dibuat Pada'].join(';')];
    list.forEach((t) => {
      baris.push([NAMA_BUKU[t.buku], t.tanggal, t.jenis === 'masuk' ? 'Pemasukan' : 'Pengeluaran', namaKategori(t.kategori), t.jumlah, t.catatan, t.dibuat_pada].map(csvSel).join(';'));
    });
    const namaFile = 'es-keuangan-' + (semuaData ? 'semua-' + hariIni() : state.buku + '-' + state.bulan) + '.csv';
    // BOM supaya Excel membaca UTF-8 dengan benar; pemisah ";" sesuai pengaturan Excel Indonesia
    const ok = await simpanFile('﻿' + baris.join('\r\n'), namaFile, 'text/csv');
    if (ok) toast('CSV tersimpan: ' + namaFile);
  }

  /* ============ Instal (PWA) ============ */
  let promptInstal = null;
  function setupInstal() {
    const btn = $('btnInstal');
    const chip = $('btnInstalHeader');
    if (isStandalone()) {
      $('instalStatus').textContent = '✔ Aplikasi sudah terinstal dan berjalan sebagai aplikasi.';
      return;
    }
    if (isIOS()) {
      $('iosGuide').hidden = false;
      chip.hidden = false;
      chip.onclick = () => { gantiView('atur'); $('cardInstal').scrollIntoView({ behavior: 'smooth' }); };
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      promptInstal = e;
      btn.hidden = false;
      chip.hidden = false;
      $('androidGuide').hidden = true;
      chip.onclick = jalankanInstal;
    });
    btn.onclick = jalankanInstal;
    window.addEventListener('appinstalled', () => {
      promptInstal = null;
      btn.hidden = true;
      chip.hidden = true;
      $('instalStatus').textContent = '✔ Aplikasi berhasil diinstal. Buka dari ikon ES Keuangan di layar utama.';
      toast('Aplikasi berhasil diinstal 🎉');
    });
    // Jika setelah beberapa detik tombol instal belum tersedia (bukan iOS), tampilkan petunjuk manual
    setTimeout(() => { if (!promptInstal && !isIOS() && !isStandalone()) $('androidGuide').hidden = false; }, 3500);
  }
  async function jalankanInstal() {
    if (!promptInstal) return;
    promptInstal.prompt();
    try { await promptInstal.userChoice; } catch (_) { /* abaikan */ }
    promptInstal = null;
    $('btnInstal').hidden = true;
    $('btnInstalHeader').hidden = true;
  }

  /* ============ Service worker ============ */
  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
    let muatUlang = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (muatUlang) location.reload(); });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Banner pembaruan tetap tampil sampai diketuk (tidak hilang sendiri)
      const tawarkan = (sw) => {
        $('updateBanner').hidden = false;
        $('btnUpdate').onclick = () => {
          $('btnUpdate').disabled = true;
          $('btnUpdate').textContent = 'Memperbarui…';
          muatUlang = true;
          sw.postMessage('skipWaiting');
          setTimeout(() => location.reload(), 3000); // cadangan bila controllerchange tidak terpicu
        };
      };
      if (reg.waiting && navigator.serviceWorker.controller) tawarkan(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) tawarkan(sw);
        });
      });
      // Cek pembaruan setiap kali aplikasi dibuka kembali dan tiap 1 jam saat terbuka
      const cek = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cek(); });
      setInterval(cek, 60 * 60 * 1000);
    }).catch((e) => console.warn('Service worker gagal didaftarkan:', e));
  }

  /* ============ Penyimpanan permanen ============ */
  async function mintaPenyimpananPermanen() {
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch (_) { /* abaikan */ }
    renderInfoStorage();
  }
  async function renderInfoStorage() {
    const el = $('storageInfo');
    if (!navigator.storage) { el.textContent = ''; return; }
    let teks = 'Jumlah data: ' + state.transaksi.length + ' transaksi, ' + state.kategori.length + ' kategori.';
    try {
      if (navigator.storage.persisted) {
        const p = await navigator.storage.persisted();
        teks += ' Penyimpanan permanen: ' + (p ? 'aktif ✔' : 'belum aktif (tetap rutin backup)') + '.';
      }
    } catch (_) { /* abaikan */ }
    el.textContent = teks;
  }

  /* ============ Event ============ */
  function pasangEvent() {
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => gantiView(b.dataset.view)));
    document.querySelectorAll('.buku-btn').forEach((b) => b.addEventListener('click', () => gantiBuku(b.dataset.buku)));
    $('txBuku').addEventListener('change', () => { $('txKirimWa').hidden = true; tampilkanKotakGambar(); });
    $('txGambar').addEventListener('change', pilihGambar);
    $('waGambar').addEventListener('change', pilihGambar);
    $('txGambarHapus').onclick = () => aturGambar(null);
    $('waGambarHapus').onclick = () => aturGambar(null);
    $('waKirimGambar').onclick = kirimGambarDariLembar;
    $('txKirimWa').onclick = () => {
      const tx = state.transaksi.find((t) => t.id === $('txId').value);
      if (!tx) return;
      tutupForm();
      bukaWa(teksWa('baru', tx));
    };
    $('waTujuanList').addEventListener('click', (e) => {
      const b = e.target.closest('.wa-tujuan');
      if (!b) return;
      const k = state.pengaturan.waKontak.find((x) => x.id === b.dataset.id);
      if (k) kirimWa(k.nomor, b);
    });
    $('waKirimLain').onclick = () => kirimWa('');
    $('waSekaligus').onclick = () => kirimKeSemua($('waTeks').value);
    $('waBagikan').onclick = bagikanWa;
    $('waSalin').onclick = salinWa;
    $('waTutup').onclick = tutupWa;
    $('waOverlay').addEventListener('click', (e) => { if (e.target === $('waOverlay')) tutupWa(); });
    $('formWaKontak').addEventListener('submit', tambahKontak);
    $('setWaAksi').addEventListener('change', simpanWaAksi);
    $('waList').addEventListener('click', (e) => {
      const b = e.target.closest('.kat-btn');
      if (!b) return;
      if (b.dataset.aksi === 'ubah') ubahKontak(b.dataset.id); else hapusKontak(b.dataset.id);
    });
    $('formSaldoAwal').addEventListener('submit', simpanSaldoAwal);
    $('setAwalPribadi').addEventListener('input', formatInputBertanda);
    $('setAwalUsaha').addEventListener('input', formatInputBertanda);
    $('prevMonth').onclick = () => { state.bulan = geserBulan(state.bulan, -1); renderSemua(); };
    $('nextMonth').onclick = () => { state.bulan = geserBulan(state.bulan, 1); renderSemua(); };
    $('monthLabel').onclick = () => { state.bulan = bulanIni(); renderSemua(); };

    document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      state.filterJenis = b.dataset.jenis;
      document.querySelectorAll('.seg-btn').forEach((x) => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-checked', x === b);
      });
      renderFilterKategori();
      renderDaftar();
    }));
    $('filterKategori').onchange = (e) => { state.filterKategori = e.target.value; renderDaftar(); };

    $('listTransaksi').addEventListener('click', (e) => {
      const item = e.target.closest('.tx-item');
      if (!item) return;
      const tx = state.transaksi.find((t) => t.id === item.dataset.id);
      if (tx) bukaForm(tx);
    });

    $('fabTambah').onclick = () => bukaForm(null);
    $('txBatal').onclick = tutupForm;
    $('txHapus').onclick = hapusDariForm;
    $('formTx').addEventListener('submit', simpanForm);
    $('sheetOverlay').addEventListener('click', (e) => { if (e.target === $('sheetOverlay')) tutupForm(); });
    document.querySelectorAll('.jt').forEach((b) => b.addEventListener('click', () => setFormJenis(b.dataset.jenis)));
    $('txJumlah').addEventListener('input', (e) => {
      const n = angkaDariInput(e.target.value);
      e.target.value = n ? titikRibuan(Math.min(n, 999999999999999)) : '';
      $('txError').hidden = true;
    });

    $('dialogOverlay').addEventListener('click', (e) => { if (e.target === $('dialogOverlay')) tutupDialog(null); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('dialogOverlay').hidden) tutupDialog(null);
      else if (!$('waOverlay').hidden) tutupWa();
      else if (!$('sheetOverlay').hidden) tutupForm();
    });

    $('formKategori').addEventListener('submit', tambahKategori);
    document.querySelectorAll('.kat-list').forEach((ul) => ul.addEventListener('click', (e) => {
      const b = e.target.closest('.kat-btn');
      if (!b) return;
      if (b.dataset.aksi === 'ubah') ubahKategori(b.dataset.id);
      else hapusKategori(b.dataset.id);
    }));

    $('btnBackup').onclick = backup;
    $('reminderBackup').onclick = backup;
    $('reminderLater').onclick = async () => {
      await DB.setMeta('snoozeBackup', new Date(Date.now() + HARI_MS).toISOString());
      $('backupReminder').hidden = true;
      toast('Diingatkan lagi besok');
    };
    $('btnRestore').onclick = () => $('fileRestore').click();
    $('fileRestore').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) restoreDariFile(f);
    });
    $('btnCsvBulan').onclick = () => eksporCsv(false);
    $('btnCsvSemua').onclick = () => eksporCsv(true);

    // Perbarui warna grafik saat mode gelap/terang berubah
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const ulangGrafik = () => { if (state.view === 'grafik') renderGrafik(); };
    if (mq.addEventListener) mq.addEventListener('change', ulangGrafik);

    // Saat aplikasi dibuka lagi (mis. keesokan hari), segarkan label "Hari ini" & pengingat
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { kembaliDariWa(); renderDaftar(); cekPengingatBackup(); renderInfoBackup(); }
    });
  }

  /* ============ Mulai ============ */
  async function mulai() {
    $('versionInfo').textContent = 'Versi ' + APP_VERSION;
    pasangEvent();
    setupInstal();
    setupServiceWorker();
    try {
      await muatData();
    } catch (ex) {
      info('Gagal membuka data', esc(ex.message) + '<br><br>Pastikan tidak memakai mode Penyamaran/Private, lalu muat ulang halaman.');
      return;
    }
    renderSemua();
    renderPengaturanUsaha();
    renderInfoBackup();
    renderInfoStorage();
    cekPengingatBackup();
  }

  mulai();
})();
